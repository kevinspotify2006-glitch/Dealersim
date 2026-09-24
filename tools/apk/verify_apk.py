#!/usr/bin/env python3
"""
Independent structural checker for the generated APK. It re-reads every binary
file from the zip by following the published formats (not by reusing the
builder's code) and fails loudly on anything malformed:

  classes.dex         header, checksum, SHA-1, map list, sort orders, string
                      data, class data, and a disassembly of every method with
                      register-range and invoke-argument checks
  AndroidManifest.xml decoded back to readable XML
  resources.arsc      decoded; the launcher icon must resolve to a file in the zip
  signature           META-INF entries present and verified by jarsigner

Usage: python3 tools/apk/verify_apk.py [path/to.apk]
"""
import hashlib
import os
import struct
import subprocess
import sys
import zipfile
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)
    return cond


def uleb(b, i):
    result = shift = 0
    while True:
        byte = b[i]
        i += 1
        result |= (byte & 0x7F) << shift
        if byte < 0x80:
            return result, i
        shift += 7


# ------------------------------------------------------------------- DEX --

def verify_dex(d):
    check(d[:8] == b'dex\n035\0', 'dex magic')
    (checksum,) = struct.unpack_from('<I', d, 8)
    check(checksum == zlib.adler32(d[12:]) & 0xFFFFFFFF, 'dex adler32 checksum')
    check(d[12:32] == hashlib.sha1(d[32:]).digest(), 'dex sha1 signature')
    file_size, header_size, endian = struct.unpack_from('<III', d, 32)
    check(file_size == len(d), 'dex file_size')
    check(header_size == 0x70 and endian == 0x12345678, 'dex header size / endian')
    link_size, link_off, map_off = struct.unpack_from('<III', d, 44)
    sizes = {}
    names = ['string_ids', 'type_ids', 'proto_ids', 'field_ids', 'method_ids', 'class_defs', 'data']
    for k, n in enumerate(names):
        sizes[n] = struct.unpack_from('<II', d, 56 + 8 * k)
    check(sizes['data'][0] % 4 == 0, 'data_size multiple of 4')
    check(sizes['data'][1] + sizes['data'][0] == len(d), 'data section runs to end of file')

    # strings
    n, off = sizes['string_ids']
    strings = []
    for k in range(n):
        (so,) = struct.unpack_from('<I', d, off + 4 * k)
        ln, p = uleb(d, so)
        end = d.index(b'\0', p)
        s = d[p:end].decode('utf-8')
        check(len(s) == ln, f'string {k} utf16 length')
        strings.append(s)
    check(strings == sorted(strings), 'string_ids sorted')
    # types
    n, off = sizes['type_ids']
    types = [strings[struct.unpack_from('<I', d, off + 4 * k)[0]] for k in range(n)]
    tids = [struct.unpack_from('<I', d, off + 4 * k)[0] for k in range(n)]
    check(tids == sorted(tids) and len(set(tids)) == len(tids), 'type_ids sorted/unique')
    # type lists
    def type_list(o):
        if o == 0:
            return []
        check(o % 4 == 0, 'type_list aligned')
        (cnt,) = struct.unpack_from('<I', d, o)
        return [types[struct.unpack_from('<H', d, o + 4 + 2 * i)[0]] for i in range(cnt)]
    # protos
    n, off = sizes['proto_ids']
    protos = []
    raw_protos = []
    for k in range(n):
        sh, rt, po = struct.unpack_from('<III', d, off + 12 * k)
        params = type_list(po)
        protos.append((strings[sh], types[rt], params))
        raw_protos.append((rt, [types.index(p) for p in params]))
        exp = ''.join('L' if t[0] in 'L[' else t for t in [types[rt]] + params)
        check(strings[sh] == exp, f'proto {k} shorty {strings[sh]} != {exp}')
    check(raw_protos == sorted(raw_protos), 'proto_ids sorted')
    # fields
    n, off = sizes['field_ids']
    fields = []
    raw = []
    for k in range(n):
        c, t, nm = struct.unpack_from('<HHI', d, off + 8 * k)
        fields.append((types[c], strings[nm], types[t]))
        raw.append((c, nm, t))
    check(raw == sorted(raw), 'field_ids sorted')
    # methods
    n, off = sizes['method_ids']
    methods = []
    raw = []
    for k in range(n):
        c, p, nm = struct.unpack_from('<HHI', d, off + 8 * k)
        methods.append((types[c], strings[nm], protos[p]))
        raw.append((c, nm, p))
    check(raw == sorted(raw), 'method_ids sorted')

    # class def + class data
    n, off = sizes['class_defs']
    check(n == 1, 'one class')
    cls, acc, sup, ifo, src, ann, cdo, sv = struct.unpack_from('<IIIIIIII', d, off)
    print(f'  class {types[cls]} extends {types[sup]} (access 0x{acc:x})')
    i = cdo
    sf, i = uleb(d, i)
    inf, i = uleb(d, i)
    dm, i = uleb(d, i)
    vm, i = uleb(d, i)
    idx = 0
    for _ in range(sf + inf):
        diff, i = uleb(d, i)
        a, i = uleb(d, i)
        idx += diff
        print(f'  field {fields[idx][1]}: {fields[idx][2]} (0x{a:x})')
    code_methods = []
    for group, count in (('direct', dm), ('virtual', vm)):
        idx = 0
        last = -1
        for _ in range(count):
            diff, i = uleb(d, i)
            a, i = uleb(d, i)
            co, i = uleb(d, i)
            idx += diff
            check(idx > last, f'{group} methods sorted')
            last = idx
            code_methods.append((methods[idx], a, co))

    # map list
    (cnt,) = struct.unpack_from('<I', d, map_off)
    prev = -1
    for k in range(cnt):
        t, _u, sz, o = struct.unpack_from('<HHII', d, map_off + 4 + 12 * k)
        check(o > prev, 'map list sorted by offset')
        prev = o

    # disassemble
    FMT = {  # opcode -> (units, name)
        0x0e: (1, 'return-void'), 0x0a: (1, 'move-result'), 0x0c: (1, 'move-result-object'),
        0x12: (1, 'const/4'), 0x13: (2, 'const/16'), 0x14: (3, 'const'), 0x1a: (2, 'const-string'),
        0x22: (2, 'new-instance'), 0x38: (2, 'if-eqz'), 0x54: (2, 'iget-object'), 0x5b: (2, 'iput-object'),
        0x6e: (3, 'invoke-virtual'), 0x6f: (3, 'invoke-super'), 0x70: (3, 'invoke-direct'),
    }
    for (m, a, co) in code_methods:
        check(co % 4 == 0, f'code item aligned for {m[1]}')
        regs, ins, outs, tries, dbg, n_insns = struct.unpack_from('<HHHHII', d, co)
        words = list(struct.unpack_from(f'<{n_insns}H', d, co + 16))
        params = m[2][2]
        check(ins == 1 + len(params), f'{m[1]} ins_size')
        print(f'  {m[0]}->{m[1]}{tuple(params) if params else "()"} regs={regs} ins={ins} outs={outs} access=0x{a:x}')
        pc = 0
        targets = set()
        starts = set()
        max_out = 0
        while pc < n_insns:
            starts.add(pc)
            w = words[pc]
            op = w & 0xFF
            if not check(op in FMT, f'{m[1]}: unknown opcode 0x{op:02x} at {pc}'):
                break
            units, name = FMT[op]
            text = name
            if op in (0x6e, 0x6f, 0x70):
                argc = w >> 12
                midx = words[pc + 1]
                r = [words[pc + 2] & 0xF, (words[pc + 2] >> 4) & 0xF, (words[pc + 2] >> 8) & 0xF, (words[pc + 2] >> 12) & 0xF, (w >> 8) & 0xF][:argc]
                tm = methods[midx]
                check(argc == 1 + len(tm[2][2]), f'{m[1]}@{pc}: {tm[1]} expects {1 + len(tm[2][2])} args, got {argc}')
                for reg in r:
                    check(reg < regs, f'{m[1]}@{pc}: register v{reg} out of range')
                max_out = max(max_out, argc)
                text = f'{name} {{{", ".join("v%d" % x for x in r)}}}, {tm[0]}->{tm[1]}'
            elif op in (0x0a, 0x0c, 0x13, 0x14, 0x1a, 0x22, 0x38):
                reg = w >> 8
                check(reg < regs, f'{m[1]}@{pc}: register v{reg} out of range')
                if op == 0x1a:
                    text = f'{name} v{reg}, "{strings[words[pc + 1]]}"'
                elif op == 0x22:
                    text = f'{name} v{reg}, {types[words[pc + 1]]}'
                elif op == 0x38:
                    tgt = pc + struct.unpack('<h', struct.pack('<H', words[pc + 1]))[0]
                    targets.add(tgt)
                    text = f'{name} v{reg}, :{tgt}'
                elif op == 0x14:
                    text = f'{name} v{reg}, 0x{words[pc + 1] | (words[pc + 2] << 16):08x}'
                else:
                    text = f'{name} v{reg}'
            elif op == 0x12:
                reg = (w >> 8) & 0xF
                check(reg < regs, f'{m[1]}@{pc}: register out of range')
                text = f'{name} v{reg}, {w >> 12}'
            elif op in (0x54, 0x5b):
                a_, b_ = (w >> 8) & 0xF, w >> 12
                check(a_ < regs and b_ < regs, f'{m[1]}@{pc}: register out of range')
                text = f'{name} v{a_}, v{b_}, {fields[words[pc + 1]][1]}'
            print(f'      {pc:3d}: {text}')
            pc += units
        check(pc == n_insns, f'{m[1]}: instruction stream length')
        for t in targets:
            check(t in starts, f'{m[1]}: branch target {t} is not an instruction start')
        check(words and (words[-1] & 0xFF) == 0x0e, f'{m[1]}: ends with return')
        check(outs >= max_out, f'{m[1]}: outs_size {outs} < {max_out}')
    return strings


# ------------------------------------------------------------ string pool --

def read_pool(b, o):
    t, hs, size, count, styles, flags, sstart, stystart = struct.unpack_from('<HHIIIIII', b, o)
    check(t == 0x0001, 'string pool type')
    utf8 = bool(flags & 0x100)
    out = []
    for k in range(count):
        (so,) = struct.unpack_from('<I', b, o + hs + 4 * k)
        p = o + sstart + so
        if utf8:
            p += 1  # utf16 len (short)
            ln = b[p]
            p += 1
            out.append(b[p:p + ln].decode('utf-8'))
        else:
            (ln,) = struct.unpack_from('<H', b, p)
            out.append(b[p + 2:p + 2 + 2 * ln].decode('utf-16-le'))
    return out, size


# --------------------------------------------------------------- AXML ---

def verify_axml(b):
    t, hs, size = struct.unpack_from('<HHI', b, 0)
    check(t == 0x0003 and size == len(b), 'axml header')
    o = 8
    strings, psize = read_pool(b, o)
    o += psize
    t, hs, rsize = struct.unpack_from('<HHI', b, o)
    check(t == 0x0180, 'resource map follows the string pool')
    ids = [struct.unpack_from('<I', b, o + 8 + 4 * k)[0] for k in range((rsize - 8) // 4)]
    o += rsize
    xml = []
    depth = 0
    seen = {}
    while o < len(b):
        t, hs, sz = struct.unpack_from('<HHI', b, o)
        if t == 0x0102:
            ns, name, ast, asz, acnt = struct.unpack_from('<IIHHH', b, o + 16)
            attrs = []
            for k in range(acnt):
                ans, an, raw, vsz, _r, dt, data = struct.unpack_from('<IIIHBBI', b, o + 16 + ast + asz * k)
                label = strings[an]
                if an < len(ids):
                    label = 'android:' + label
                    seen[strings[an]] = ids[an]
                val = strings[data] if dt == 0x03 else (f'@0x{data:08x}' if dt == 0x01 else ('true' if dt == 0x12 and data else (hex(data) if dt == 0x11 else str(data))))
                attrs.append(f'{label}="{val}"')
            xml.append('  ' * depth + f'<{strings[name]} ' + ' '.join(attrs) + '>')
            depth += 1
        elif t == 0x0103:
            depth -= 1
        o += sz
    check(depth == 0, 'axml balanced')
    print('\n'.join(xml))
    expect = {'minSdkVersion': 0x0101020c, 'targetSdkVersion': 0x01010270, 'versionCode': 0x0101021b, 'name': 0x01010003}
    for k, v in expect.items():
        check(seen.get(k) == v, f'resource id for android:{k}')


# --------------------------------------------------------------- ARSC ---

def verify_arsc(b, names):
    t, hs, size, pkgs = struct.unpack_from('<HHII', b, 0)
    check(t == 0x0002 and size == len(b) and pkgs == 1, 'arsc header')
    values, psize = read_pool(b, 12)
    o = 12 + psize
    t, phs, psz, pid = struct.unpack_from('<HHII', b, o)
    check(t == 0x0200 and pid == 0x7F, 'arsc package')
    type_off, _, key_off, _ = struct.unpack_from('<IIII', b, o + 268)
    tstrings, _ = read_pool(b, o + type_off)
    kstrings, _ = read_pool(b, o + key_off)
    p = o + phs
    found = None
    while p < o + psz:
        ct, chs, csz = struct.unpack_from('<HHI', b, p)
        if ct == 0x0201:
            tid, flags, _res, cnt, estart = struct.unpack_from('<BBHII', b, p + 8)
            (csize,) = struct.unpack_from('<I', b, p + 20)
            (density,) = struct.unpack_from('<H', b, p + 20 + 14)
            (eoff,) = struct.unpack_from('<I', b, p + chs)
            e = p + estart + eoff
            esz, eflags, key = struct.unpack_from('<HHI', b, e)
            vsz, _z, dt, data = struct.unpack_from('<HBBI', b, e + esz)
            found = (tid, tstrings[tid - 1], kstrings[key], values[data], density)
        p += csz
    check(found is not None, 'arsc has an entry')
    if found:
        print(f'  @{found[1]}/{found[2]} (0x7f{found[0]:02x}0000, density {found[4]}) -> {found[3]}')
        check(found[3] in names, 'icon file exists in the APK')


def main():
    apk = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'release', 'Car-Dealership-Manager-Tycoon.apk')
    z = zipfile.ZipFile(apk)
    names = z.namelist()
    for need in ('AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'assets/www/index.html'):
        check(need in names, f'{need} in APK')
    check(any(n.startswith('META-INF/') and n.endswith('.RSA') for n in names), 'v1 signature block present')
    print('classes.dex:')
    verify_dex(z.read('classes.dex'))
    print('AndroidManifest.xml:')
    verify_axml(z.read('AndroidManifest.xml'))
    print('resources.arsc:')
    verify_arsc(z.read('resources.arsc'), names)
    html = z.read('assets/www/index.html')
    check(b'__CDMT__' in html and b'<script>' in html, 'game bundle inside assets')
    check(b'serviceWorker' not in html, 'no service worker in the APK build')
    r = subprocess.run(['jarsigner', '-verify', apk], capture_output=True, text=True)
    check('jar verified' in r.stdout, 'jarsigner verification')
    if errors:
        print('\nFAILED:\n  ' + '\n  '.join(errors))
        sys.exit(1)
    print('\nAPK structure OK')


if __name__ == '__main__':
    main()
