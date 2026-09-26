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

    # disassemble + type-flow check (a small subset of what ART's verifier does)
    FMT = {  # opcode -> (units, name)
        0x0e: (1, 'return-void'), 0x0a: (1, 'move-result'), 0x0c: (1, 'move-result-object'),
        0x12: (1, 'const/4'), 0x13: (2, 'const/16'), 0x14: (3, 'const'), 0x1a: (2, 'const-string'),
        0x22: (2, 'new-instance'), 0x34: (2, 'if-lt'), 0x38: (2, 'if-eqz'), 0x39: (2, 'if-nez'),
        0x54: (2, 'iget-object'), 0x59: (2, 'iput'), 0x5b: (2, 'iput-object'), 0x60: (2, 'sget'),
        0x6e: (3, 'invoke-virtual'), 0x6f: (3, 'invoke-super'), 0x70: (3, 'invoke-direct'),
        0x71: (3, 'invoke-static'), 0x72: (3, 'invoke-interface'),
    }
    OBJ = 'Ljava/lang/Object;'
    SUPER = {
        'Lcom/cdmt/game/MainActivity;': 'Landroid/app/Activity;',
        'Landroid/app/Activity;': 'Landroid/view/ContextThemeWrapper;',
        'Landroid/view/ContextThemeWrapper;': 'Landroid/content/ContextWrapper;',
        'Landroid/content/ContextWrapper;': 'Landroid/content/Context;',
        'Landroid/webkit/WebView;': 'Landroid/widget/AbsoluteLayout;',
        'Landroid/widget/AbsoluteLayout;': 'Landroid/view/ViewGroup;',
        'Landroid/view/ViewGroup;': 'Landroid/view/View;',
    }
    INTERFACES = {'Landroid/view/WindowInsetsController;'}

    def assignable(src, dst):
        if dst == OBJ or src == dst:
            return True
        while src in SUPER:
            src = SUPER[src]
            if src == dst:
                return True
        return False

    def is_prim(t):
        return t in ('I', 'Z')

    for (m, a, co) in code_methods:
        check(co % 4 == 0, f'code item aligned for {m[1]}')
        regs, ins, outs, tries, dbg, n_insns = struct.unpack_from('<HHHHII', d, co)
        words = list(struct.unpack_from(f'<{n_insns}H', d, co + 16))
        params = m[2][2]
        is_static = False
        check(ins == (0 if is_static else 1) + len(params), f'{m[1]} ins_size')
        print(f'  {m[0]}->{m[1]}{tuple(params) if params else "()"} regs={regs} ins={ins} outs={outs} access=0x{a:x}')
        pc = 0
        insn = {}
        max_out = 0
        # ---- decode
        while pc < n_insns:
            w = words[pc]
            op = w & 0xFF
            if not check(op in FMT, f'{m[1]}: unknown opcode 0x{op:02x} at {pc}'):
                break
            units, name = FMT[op]
            info = {'op': op, 'name': name, 'units': units}
            if op in (0x6e, 0x6f, 0x70, 0x71, 0x72):
                argc = w >> 12
                midx = words[pc + 1]
                r = [words[pc + 2] & 0xF, (words[pc + 2] >> 4) & 0xF, (words[pc + 2] >> 8) & 0xF, (words[pc + 2] >> 12) & 0xF, (w >> 8) & 0xF][:argc]
                tm = methods[midx]
                receiver = 0 if op == 0x71 else 1
                check(argc == receiver + len(tm[2][2]), f'{m[1]}@{pc}: {tm[1]} expects {receiver + len(tm[2][2])} args, got {argc}')
                max_out = max(max_out, argc)
                info.update(regs=r, method=tm)
                text = f'{name} {{{", ".join("v%d" % x for x in r)}}}, {tm[0]}->{tm[1]}'
            elif op in (0x0a, 0x0c, 0x13, 0x14, 0x1a, 0x22, 0x38, 0x39, 0x60):
                reg = w >> 8
                info['a'] = reg
                if op == 0x1a:
                    text = f'{name} v{reg}, "{strings[words[pc + 1]]}"'
                elif op == 0x22:
                    info['type'] = types[words[pc + 1]]
                    text = f'{name} v{reg}, {info["type"]}'
                elif op in (0x38, 0x39):
                    info['target'] = pc + struct.unpack('<h', struct.pack('<H', words[pc + 1]))[0]
                    text = f'{name} v{reg}, :{info["target"]}'
                elif op == 0x60:
                    info['field'] = fields[words[pc + 1]]
                    text = f'{name} v{reg}, {info["field"][0]}->{info["field"][1]}'
                elif op == 0x14:
                    text = f'{name} v{reg}, 0x{words[pc + 1] | (words[pc + 2] << 16):08x}'
                elif op == 0x13:
                    text = f'{name} v{reg}, {struct.unpack("<h", struct.pack("<H", words[pc + 1]))[0]}'
                else:
                    text = f'{name} v{reg}'
            elif op == 0x12:
                info['a'] = (w >> 8) & 0xF
                text = f'{name} v{info["a"]}, {w >> 12}'
            elif op == 0x34:
                info['a'], info['b'] = (w >> 8) & 0xF, w >> 12
                info['target'] = pc + struct.unpack('<h', struct.pack('<H', words[pc + 1]))[0]
                text = f'{name} v{info["a"]}, v{info["b"]}, :{info["target"]}'
            elif op in (0x54, 0x59, 0x5b):
                info['a'], info['b'] = (w >> 8) & 0xF, w >> 12
                info['field'] = fields[words[pc + 1]]
                text = f'{name} v{info["a"]}, v{info["b"]}, {info["field"][1]}'
            else:
                text = name
            for key in ('a', 'b'):
                if key in info:
                    check(info[key] < regs, f'{m[1]}@{pc}: register v{info[key]} out of range')
            for reg in info.get('regs', []):
                check(reg < regs, f'{m[1]}@{pc}: register v{reg} out of range')
            insn[pc] = info
            print(f'      {pc:3d}: {text}')
            pc += units
        check(pc == n_insns, f'{m[1]}: instruction stream length')
        check(words and (words[-1] & 0xFF) == 0x0e, f'{m[1]}: ends with return')
        check(outs >= max_out, f'{m[1]}: outs_size {outs} < {max_out}')
        for info in insn.values():
            if 'target' in info:
                check(info['target'] in insn, f'{m[1]}: branch target {info["target"]} is not an instruction start')

        # ---- type flow over the control-flow graph
        entry = [None] * regs
        first_param = regs - ins
        entry[first_param] = ('obj', m[0]) if m[1] != '<init>' else ('uninit_this', m[0])
        for k, t in enumerate(params):
            entry[first_param + 1 + k] = 'int' if is_prim(t) else ('obj', t)
        states = {0: (entry, None)}
        work = [0]
        visits = 0
        while work and visits < 5000:
            visits += 1
            pc = work.pop()
            st, pending = states[pc]
            st = list(st)
            info = insn.get(pc)
            if info is None:
                break
            op = info['op']
            where = f'{m[1]}@{pc}'

            def need_int(r):
                check(st[r] == 'int', f'{where}: v{r} must hold an int, has {st[r]}')

            def need_obj(r, t):
                v = st[r]
                ok = isinstance(v, tuple) and v[0] == 'obj' and (assignable(v[1], t) or (t in INTERFACES and v[1] == t))
                check(ok, f'{where}: v{r} must hold {t}, has {v}')
            if op in (0x0a, 0x0c):
                check(pending is not None, f'{where}: move-result without a preceding invoke result')
                if pending is not None:
                    if op == 0x0a:
                        check(is_prim(pending), f'{where}: move-result of {pending}')
                        st[info['a']] = 'int'
                    else:
                        check(not is_prim(pending) and pending != 'V', f'{where}: move-result-object of {pending}')
                        st[info['a']] = ('obj', pending)
            elif op in (0x12, 0x13, 0x14):
                st[info['a']] = 'int'
            elif op == 0x1a:
                st[info['a']] = ('obj', 'Ljava/lang/String;')
            elif op == 0x22:
                st[info['a']] = ('uninit', info['type'])
            elif op == 0x60:
                check(info['field'][2] == 'I', f'{where}: sget on non-int field')
                st[info['a']] = 'int'
            elif op == 0x54:
                need_obj(info['b'], info['field'][0])
                st[info['a']] = ('obj', info['field'][2])
            elif op == 0x59:
                need_int(info['a'])
                need_obj(info['b'], info['field'][0])
            elif op == 0x5b:
                need_obj(info['a'], info['field'][2])
                need_obj(info['b'], info['field'][0])
            elif op == 0x34:
                need_int(info['a'])
                need_int(info['b'])
            elif op in (0x38, 0x39):
                check(st[info['a']] == 'int' or (isinstance(st[info['a']], tuple) and st[info['a']][0] == 'obj'), f'{where}: if on undefined v{info["a"]}')
            elif op in (0x6e, 0x6f, 0x70, 0x71, 0x72):
                tm = info['method']
                cls_, name_, (sh_, ret_, ps_) = tm
                r = info['regs']
                args = r
                if op != 0x71:
                    recv = st[r[0]]
                    if name_ == '<init>':
                        check(isinstance(recv, tuple) and recv[0] in ('uninit', 'uninit_this'), f'{where}: <init> on initialised v{r[0]}')
                        if isinstance(recv, tuple):
                            want = cls_ if recv[0] == 'uninit' else SUPER.get(recv[1])
                            check(recv[1] == cls_ or want == cls_, f'{where}: <init> of {cls_} on {recv[1]}')
                            for k2 in range(regs):
                                if st[k2] == recv:
                                    st[k2] = ('obj', recv[1])
                    elif op == 0x72:
                        check(cls_ in INTERFACES, f'{where}: invoke-interface on class {cls_}')
                        need_obj(r[0], cls_)
                    else:
                        check(cls_ not in INTERFACES, f'{where}: {name.split()[0] if False else "invoke"} on interface {cls_}')
                        need_obj(r[0], cls_)
                        if op == 0x6f:
                            check(m[0] == 'Lcom/cdmt/game/MainActivity;' and SUPER.get(m[0]) == cls_, f'{where}: invoke-super to {cls_}')
                    args = r[1:]
                for k2, t in enumerate(ps_):
                    if is_prim(t):
                        need_int(args[k2])
                    else:
                        need_obj(args[k2], t)
            elif op == 0x0e:
                check(m[2][1] == 'V', f'{where}: return-void from non-void method')
            # successors
            nxt_pending = info['method'][2][1] if op in (0x6e, 0x6f, 0x70, 0x71, 0x72) and info['method'][2][1] != 'V' else None
            succ = []
            if op != 0x0e:
                succ.append(pc + info['units'])
            if 'target' in info:
                succ.append(info['target'])
            for s2 in succ:
                if s2 not in insn:
                    check(False, f'{where}: falls off the end')
                    continue
                pend = nxt_pending if s2 == pc + info['units'] else None
                if s2 not in states:
                    states[s2] = (st, pend)
                    work.append(s2)
                else:
                    old, oldp = states[s2]
                    merged = [x if x == y else None for x, y in zip(old, st)]
                    mp = oldp if oldp == pend else None
                    if merged != old or mp != oldp:
                        states[s2] = (merged, mp)
                        work.append(s2)
        check(visits < 5000, f'{m[1]}: type flow did not converge')
        # the constructor must initialise this
        if m[1] == '<init>':
            ends = [pc for pc, i in insn.items() if i['op'] == 0x0e]
            for e in ends:
                check(pc in states and all(not (isinstance(x, tuple) and x[0] == 'uninit_this') for x in states[e][0]), '<init> returns without calling super')
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
