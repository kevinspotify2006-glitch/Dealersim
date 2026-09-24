#!/usr/bin/env python3
"""
Builds the Android APK for Car Dealership Manager Tycoon **without the Android SDK**.

Why: the game is a single self-contained HTML file. The Android side only needs a
tiny native shell (one Activity hosting a WebView). That shell is small enough to
emit directly, so the APK can be rebuilt anywhere with Python 3 and a JDK
(for keytool/jarsigner) — no Gradle, no SDK download, works offline.

What it writes (all by hand, following the published file formats):
  AndroidManifest.xml  binary XML (AXML)
  resources.arsc       resource table with the launcher icon
  classes.dex          Dalvik bytecode for com.cdmt.game.MainActivity
  assets/www/index.html  the game (from dist/android, produced by `npm run build`)
Then signs it (APK signature scheme v1 via jarsigner, SHA-256).

The equivalent Java source is android/app/src/main/java/com/cdmt/game/MainActivity.java,
and the Gradle project in android/ builds the same app with Android Studio.

Usage:
  python3 tools/apk/build_apk.py [--out release/Car-Dealership-Manager-Tycoon.apk]
"""
import argparse
import hashlib
import io
import os
import shutil
import struct
import subprocess
import sys
import zipfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

PACKAGE = 'com.cdmt.tycoon'
ACTIVITY = 'com.cdmt.game.MainActivity'
APP_LABEL = 'Dealer Tycoon'
VERSION_CODE = 2
VERSION_NAME = '2.0.0'
MIN_SDK = 24
TARGET_SDK = 29          # v1 signing is accepted for targetSdk < 30
BG_COLOR = 0xFF0F1114    # status/navigation bar and WebView background

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def u8(v): return struct.pack('<B', v)
def u16(v): return struct.pack('<H', v & 0xFFFF)
def u32(v): return struct.pack('<I', v & 0xFFFFFFFF)
def align(b, n=4):
    return b + b'\0' * ((-len(b)) % n)

def uleb128(v):
    out = bytearray()
    while True:
        byte = v & 0x7F
        v >>= 7
        if v:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)

# --------------------------------------------------------------------------
# Binary XML (AndroidManifest.xml)
# --------------------------------------------------------------------------

ANDROID_NS = 'http://schemas.android.com/apk/res/android'
ATTR_IDS = {
    'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003, 'exported': 0x01010010,
    'configChanges': 0x0101001f, 'minSdkVersion': 0x0101020c, 'versionCode': 0x0101021b,
    'versionName': 0x0101021c, 'windowSoftInputMode': 0x0101022b, 'targetSdkVersion': 0x01010270,
    'allowBackup': 0x01010280, 'hardwareAccelerated': 0x010102d3,
}
T_REFERENCE, T_STRING, T_INT_DEC, T_INT_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12


def string_pool(strings, utf8=False):
    """ResStringPool chunk (UTF-16 by default)."""
    offsets = b''
    data = b''
    for s in strings:
        offsets += u32(len(data))
        if utf8:
            enc = s.encode('utf-8')
            data += u8(len(s)) + u8(len(enc)) + enc + b'\0'
        else:
            enc = s.encode('utf-16-le')
            data += u16(len(s)) + enc + b'\0\0'
    data = align(data)
    header_size = 28
    strings_start = header_size + len(offsets)
    size = strings_start + len(data)
    flags = 0x100 if utf8 else 0
    return u16(0x0001) + u16(header_size) + u32(size) + u32(len(strings)) + u32(0) + u32(flags) + u32(strings_start) + u32(0) + offsets + data


class Axml:
    def __init__(self):
        self.attr_names = []   # android attribute names, resource-mapped (first in pool)
        self.strings = []
        self.nodes = []

    def s(self, value):
        if value not in self.strings:
            self.strings.append(value)
        return value

    def build(self, tree):
        # Collect android: attribute names first (they must lead the pool, in resource-map order).
        def walk(node):
            tag, attrs, children = node
            for (ns, name, _t, _v) in attrs:
                if ns == 'android' and name not in self.attr_names:
                    self.attr_names.append(name)
            for c in children:
                walk(c)
        walk(tree)
        self.attr_names.sort(key=lambda n: ATTR_IDS[n])
        self.strings = list(self.attr_names)
        self.s('android')
        self.s(ANDROID_NS)

        def collect(node):
            tag, attrs, children = node
            self.s(tag)
            for (ns, name, typ, val) in attrs:
                self.s(name)
                if typ == T_STRING:
                    self.s(val)
            for c in children:
                collect(c)
        collect(tree)

        idx = {v: i for i, v in enumerate(self.strings)}
        body = b''
        line = 1

        def node_header(ntype, ext):
            size = 16 + len(ext)
            return u16(ntype) + u16(16) + u32(size) + u32(line) + u32(0xFFFFFFFF) + ext

        body += node_header(0x0100, u32(idx['android']) + u32(idx[ANDROID_NS]))

        def emit(node):
            nonlocal body, line
            tag, attrs, children = node
            # Attributes sorted by resource id (android: first by id, then plain).
            def key(a):
                ns, name, _t, _v = a
                return (0, ATTR_IDS[name]) if ns == 'android' else (1, idx[name])
            enc = b''
            for (ns, name, typ, val) in sorted(attrs, key=key):
                ns_idx = idx[ANDROID_NS] if ns == 'android' else 0xFFFFFFFF
                if typ == T_STRING:
                    raw = idx[val]
                    data = idx[val]
                else:
                    raw = 0xFFFFFFFF
                    data = val
                enc += u32(ns_idx) + u32(idx[name]) + u32(raw) + u16(8) + u8(0) + u8(typ) + u32(data)
            ext = u32(0xFFFFFFFF) + u32(idx[tag]) + u16(20) + u16(20) + u16(len(attrs)) + u16(0) + u16(0) + u16(0) + enc
            body += node_header(0x0102, ext)
            line += 1
            for c in children:
                emit(c)
            body += node_header(0x0103, u32(0xFFFFFFFF) + u32(idx[tag]))
            line += 1

        emit(tree)
        body += node_header(0x0101, u32(idx['android']) + u32(idx[ANDROID_NS]))

        pool = string_pool(self.strings)
        resmap_ids = b''.join(u32(ATTR_IDS[n]) for n in self.attr_names)
        resmap = u16(0x0180) + u16(8) + u32(8 + len(resmap_ids)) + resmap_ids
        total = 8 + len(pool) + len(resmap) + len(body)
        return u16(0x0003) + u16(8) + u32(total) + pool + resmap + body


def manifest_xml():
    A = 'android'
    config_changes = 0x0080 | 0x0020 | 0x0010 | 0x0400 | 0x0800 | 0x0100 | 0x0200 | 0x1000
    tree = ('manifest', [
        (None, 'package', T_STRING, PACKAGE),
        (A, 'versionCode', T_INT_DEC, VERSION_CODE),
        (A, 'versionName', T_STRING, VERSION_NAME),
    ], [
        ('uses-sdk', [(A, 'minSdkVersion', T_INT_DEC, MIN_SDK), (A, 'targetSdkVersion', T_INT_DEC, TARGET_SDK)], []),
        ('uses-permission', [(A, 'name', T_STRING, 'android.permission.VIBRATE')], []),
        ('application', [
            (A, 'label', T_STRING, APP_LABEL),
            (A, 'icon', T_REFERENCE, 0x7F010000),
            (A, 'allowBackup', T_BOOL, 0xFFFFFFFF),
            (A, 'hardwareAccelerated', T_BOOL, 0xFFFFFFFF),
        ], [
            ('activity', [
                (A, 'name', T_STRING, ACTIVITY),
                (A, 'exported', T_BOOL, 0xFFFFFFFF),
                (A, 'configChanges', T_INT_HEX, config_changes),
                (A, 'windowSoftInputMode', T_INT_HEX, 0x10),
            ], [
                ('intent-filter', [], [
                    ('action', [(A, 'name', T_STRING, 'android.intent.action.MAIN')], []),
                    ('category', [(A, 'name', T_STRING, 'android.intent.category.LAUNCHER')], []),
                ]),
            ]),
        ]),
    ])
    return Axml().build(tree)

# --------------------------------------------------------------------------
# resources.arsc — one resource: @mipmap/ic_launcher (0x7f010000), xxxhdpi PNG
# --------------------------------------------------------------------------

ICON_PATH = 'res/mipmap-xxxhdpi-v4/ic_launcher.png'


def resources_arsc():
    global_pool = string_pool([ICON_PATH], utf8=True)
    type_pool = string_pool(['mipmap'], utf8=True)
    key_pool = string_pool(['ic_launcher'], utf8=True)

    # typeSpec: one entry, varies by density
    type_spec = u16(0x0202) + u16(16) + u32(16 + 4) + u8(1) + u8(0) + u16(0) + u32(1) + u32(0x0100)

    # ResTable_config (52 bytes): density = 640 (xxxhdpi), sdkVersion = 4 (as aapt adds for densities)
    config = bytearray(52)
    struct.pack_into('<I', config, 0, 52)
    struct.pack_into('<H', config, 14, 640)
    struct.pack_into('<H', config, 24, 4)
    header_size = 20 + len(config)
    entry = u16(8) + u16(0) + u32(0) + u16(8) + u8(0) + u8(T_STRING) + u32(0)
    entries_start = header_size + 4
    type_chunk_size = entries_start + len(entry)
    type_chunk = u16(0x0201) + u16(header_size) + u32(type_chunk_size) + u8(1) + u8(0) + u16(0) + u32(1) + u32(entries_start) + bytes(config) + u32(0) + entry

    name = PACKAGE.encode('utf-16-le')
    name = name + b'\0' * (256 - len(name))
    pkg_header_size = 288
    type_strings_off = pkg_header_size
    key_strings_off = type_strings_off + len(type_pool)
    pkg_body = type_pool + key_pool + type_spec + type_chunk
    pkg_size = pkg_header_size + len(pkg_body)
    package = (u16(0x0200) + u16(pkg_header_size) + u32(pkg_size) + u32(0x7F) + name +
               u32(type_strings_off) + u32(1) + u32(key_strings_off) + u32(1) + u32(0) + pkg_body)
    total = 12 + len(global_pool) + len(package)
    return u16(0x0002) + u16(12) + u32(total) + u32(1) + global_pool + package

# --------------------------------------------------------------------------
# classes.dex — com.cdmt.game.MainActivity
# --------------------------------------------------------------------------

CLS = 'Lcom/cdmt/game/MainActivity;'
ACT = 'Landroid/app/Activity;'
WEB = 'Landroid/webkit/WebView;'
SET = 'Landroid/webkit/WebSettings;'
WIN = 'Landroid/view/Window;'
VIEW = 'Landroid/view/View;'
CTX = 'Landroid/content/Context;'
BUNDLE = 'Landroid/os/Bundle;'
STR = 'Ljava/lang/String;'

URL = 'file:///android_asset/www/index.html'
JS_SAVE = 'javascript:window.cdmSave&&window.cdmSave()'

# (class, name, return, params)
METHODS = [
    (ACT, '<init>', 'V', []),
    (ACT, 'onCreate', 'V', [BUNDLE]),
    (ACT, 'onBackPressed', 'V', []),
    (ACT, 'onPause', 'V', []),
    (ACT, 'requestWindowFeature', 'Z', ['I']),
    (ACT, 'setContentView', 'V', [VIEW]),
    (ACT, 'getWindow', WIN, []),
    (WEB, '<init>', 'V', [CTX]),
    (WEB, 'getSettings', SET, []),
    (WEB, 'setBackgroundColor', 'V', ['I']),
    (WEB, 'loadUrl', 'V', [STR]),
    (WEB, 'canGoBack', 'Z', []),
    (WEB, 'goBack', 'V', []),
    (SET, 'setJavaScriptEnabled', 'V', ['Z']),
    (SET, 'setDomStorageEnabled', 'V', ['Z']),
    (SET, 'setAllowFileAccess', 'V', ['Z']),
    (SET, 'setTextZoom', 'V', ['I']),
    (SET, 'setMediaPlaybackRequiresUserGesture', 'V', ['Z']),
    (WIN, 'setStatusBarColor', 'V', ['I']),
    (WIN, 'setNavigationBarColor', 'V', ['I']),
    (CLS, '<init>', 'V', []),
    (CLS, 'onCreate', 'V', [BUNDLE]),
    (CLS, 'onBackPressed', 'V', []),
    (CLS, 'onPause', 'V', []),
]
FIELDS = [(CLS, 'web', WEB)]


def shorty(ret, params):
    def c(t):
        return 'L' if t.startswith('L') or t.startswith('[') else t
    return c(ret) + ''.join(c(p) for p in params)


def build_dex():
    # ---- collect strings, types, protos
    types = set([CLS, ACT, WEB, SET, WIN, VIEW, CTX, BUNDLE, STR, 'V', 'Z', 'I'])
    strings = set(types)
    protos = set()
    for (c, n, r, p) in METHODS:
        strings.add(n)
        protos.add((r, tuple(p)))
        strings.add(shorty(r, p))
    for (c, n, t) in FIELDS:
        strings.add(n)
    strings.update([URL, JS_SAVE])

    def mutf8_key(s):
        # string_ids are sorted by UTF-16 code units; all our strings are ASCII.
        return [ord(ch) for ch in s]
    strings = sorted(strings, key=mutf8_key)
    sidx = {s: i for i, s in enumerate(strings)}
    types = sorted(types, key=lambda t: sidx[t])
    tidx = {t: i for i, t in enumerate(types)}
    protos = sorted(protos, key=lambda pr: (tidx[pr[0]], [tidx[x] for x in pr[1]]))
    pidx = {p: i for i, p in enumerate(protos)}
    fields = sorted(FIELDS, key=lambda f: (tidx[f[0]], sidx[f[1]], tidx[f[2]]))
    fidx = {(f[0], f[1]): i for i, f in enumerate(fields)}
    methods = sorted(METHODS, key=lambda m: (tidx[m[0]], sidx[m[1]], pidx[(m[2], tuple(m[3]))]))
    midx = {(m[0], m[1], m[2], tuple(m[3])): i for i, m in enumerate(methods)}

    def M(cls, name, ret, params=()):
        return midx[(cls, name, ret, tuple(params))]

    # ---- bytecode
    def invoke(op, method, regs):
        a = len(regs)
        r = list(regs) + [0] * (5 - len(regs))
        return [(a << 12) | (r[4] << 8) | op, method, (r[3] << 12) | (r[2] << 8) | (r[1] << 4) | r[0]]
    INV_VIRTUAL, INV_SUPER, INV_DIRECT = 0x6e, 0x6f, 0x70
    def move_result_object(a): return [(a << 8) | 0x0c]
    def move_result(a): return [(a << 8) | 0x0a]
    def const4(a, v): return [((v & 0xF) << 12) | (a << 8) | 0x12]
    def const16(a, v): return [(a << 8) | 0x13, v & 0xFFFF]
    def const32(a, v): return [(a << 8) | 0x14, v & 0xFFFF, (v >> 16) & 0xFFFF]
    def const_string(a, s): return [(a << 8) | 0x1a, sidx[s]]
    def new_instance(a, t): return [(a << 8) | 0x22, tidx[t]]
    def iput_object(a, b, f): return [(b << 12) | (a << 8) | 0x5b, f]
    def iget_object(a, b, f): return [(b << 12) | (a << 8) | 0x54, f]
    def if_eqz(a, off): return [(a << 8) | 0x38, off & 0xFFFF]
    RETURN_VOID = [0x000e]
    web_f = fidx[(CLS, 'web')]

    # <init>: registers 1 (v0 = this)
    init_code = invoke(INV_DIRECT, M(ACT, '<init>', 'V'), [0]) + RETURN_VOID

    # onCreate: registers 6 (v0-v3 locals, v4 = this, v5 = bundle)
    oc = []
    oc += invoke(INV_SUPER, M(ACT, 'onCreate', 'V', [BUNDLE]), [4, 5])
    oc += const4(0, 1)
    oc += invoke(INV_VIRTUAL, M(ACT, 'requestWindowFeature', 'Z', ['I']), [4, 0])   # FEATURE_NO_TITLE
    oc += new_instance(0, WEB)
    oc += invoke(INV_DIRECT, M(WEB, '<init>', 'V', [CTX]), [0, 4])
    oc += iput_object(0, 4, web_f)
    oc += invoke(INV_VIRTUAL, M(WEB, 'getSettings', SET), [0])
    oc += move_result_object(1)
    oc += const4(2, 1)
    oc += invoke(INV_VIRTUAL, M(SET, 'setJavaScriptEnabled', 'V', ['Z']), [1, 2])
    oc += invoke(INV_VIRTUAL, M(SET, 'setDomStorageEnabled', 'V', ['Z']), [1, 2])
    oc += invoke(INV_VIRTUAL, M(SET, 'setAllowFileAccess', 'V', ['Z']), [1, 2])
    oc += const4(2, 0)
    oc += invoke(INV_VIRTUAL, M(SET, 'setMediaPlaybackRequiresUserGesture', 'V', ['Z']), [1, 2])
    oc += const16(3, 100)
    oc += invoke(INV_VIRTUAL, M(SET, 'setTextZoom', 'V', ['I']), [1, 3])
    oc += const32(3, BG_COLOR)
    oc += invoke(INV_VIRTUAL, M(WEB, 'setBackgroundColor', 'V', ['I']), [0, 3])
    oc += invoke(INV_VIRTUAL, M(ACT, 'getWindow', WIN), [4])
    oc += move_result_object(1)
    oc += invoke(INV_VIRTUAL, M(WIN, 'setStatusBarColor', 'V', ['I']), [1, 3])
    oc += invoke(INV_VIRTUAL, M(WIN, 'setNavigationBarColor', 'V', ['I']), [1, 3])
    oc += invoke(INV_VIRTUAL, M(ACT, 'setContentView', 'V', [VIEW]), [4, 0])
    oc += const_string(1, URL)
    oc += invoke(INV_VIRTUAL, M(WEB, 'loadUrl', 'V', [STR]), [0, 1])
    oc += RETURN_VOID

    # onBackPressed: registers 3 (v0 web, v1 flag, v2 this)
    ob = []
    ob += iget_object(0, 2, web_f)                       # 0
    ob += if_eqz(0, 12)                                  # 2  -> 14
    ob += invoke(INV_VIRTUAL, M(WEB, 'canGoBack', 'Z'), [0])   # 4
    ob += move_result(1)                                 # 7
    ob += if_eqz(1, 6)                                   # 8  -> 14
    ob += invoke(INV_VIRTUAL, M(WEB, 'goBack', 'V'), [0])      # 10
    ob += RETURN_VOID                                    # 13
    ob += invoke(INV_SUPER, M(ACT, 'onBackPressed', 'V'), [2])  # 14
    ob += RETURN_VOID                                    # 17
    assert len(ob) == 18

    # onPause: registers 3 (v0 web, v1 url, v2 this)
    op = []
    op += invoke(INV_SUPER, M(ACT, 'onPause', 'V'), [2])       # 0
    op += iget_object(0, 2, web_f)                       # 3
    op += if_eqz(0, 7)                                   # 5 -> 12
    op += const_string(1, JS_SAVE)                       # 7
    op += invoke(INV_VIRTUAL, M(WEB, 'loadUrl', 'V', [STR]), [0, 1])  # 9
    op += RETURN_VOID                                    # 12
    assert len(op) == 13

    codes = {
        '<init>': (1, 1, 1, init_code),
        'onCreate': (6, 2, 2, oc),
        'onBackPressed': (3, 1, 1, ob),
        'onPause': (3, 1, 2, op),
    }

    # ---- layout
    n_str, n_type, n_proto, n_field, n_meth = len(strings), len(types), len(protos), len(fields), len(methods)
    off = 0x70
    string_ids_off = off; off += 4 * n_str
    type_ids_off = off; off += 4 * n_type
    proto_ids_off = off; off += 12 * n_proto
    field_ids_off = off; off += 8 * n_field
    method_ids_off = off; off += 8 * n_meth
    class_defs_off = off; off += 32
    data_off = off

    data = bytearray()
    def pos():
        return data_off + len(data)
    def pad4():
        while (data_off + len(data)) % 4:
            data.append(0)

    # code items
    pad4()
    code_off = {}
    code_items_start = pos()
    for name in ['<init>', 'onCreate', 'onBackPressed', 'onPause']:
        pad4()
        regs, ins, outs, insns = codes[name]
        code_off[name] = pos()
        data += u16(regs) + u16(ins) + u16(outs) + u16(0) + u32(0) + u32(len(insns))
        data += b''.join(u16(x) for x in insns)
    n_code = 4

    # string data
    string_data_start = pos()
    string_data_off = []
    for s in strings:
        string_data_off.append(pos())
        data += uleb128(len(s)) + s.encode('utf-8') + b'\0'

    # type lists (proto parameters), deduplicated
    pad4()
    type_lists_start = pos()
    tl_off = {}
    for pr in protos:
        params = pr[1]
        if not params or params in tl_off:
            continue
        pad4()
        tl_off[params] = pos()
        data += u32(len(params)) + b''.join(u16(tidx[p]) for p in params)
    n_type_lists = len(tl_off)

    # class data
    class_data_start = pos()
    direct = [M(CLS, '<init>', 'V')]
    virtual = sorted([M(CLS, 'onBackPressed', 'V'), M(CLS, 'onCreate', 'V', [BUNDLE]), M(CLS, 'onPause', 'V')])
    name_of = {M(CLS, '<init>', 'V'): '<init>', M(CLS, 'onBackPressed', 'V'): 'onBackPressed',
               M(CLS, 'onCreate', 'V', [BUNDLE]): 'onCreate', M(CLS, 'onPause', 'V'): 'onPause'}
    access = {'<init>': 0x10001, 'onCreate': 0x4, 'onBackPressed': 0x1, 'onPause': 0x4}
    cd = uleb128(0) + uleb128(1) + uleb128(len(direct)) + uleb128(len(virtual))
    cd += uleb128(fidx[(CLS, 'web')]) + uleb128(0x2)   # private WebView web
    prev = 0
    for m in direct:
        cd += uleb128(m - prev) + uleb128(access[name_of[m]]) + uleb128(code_off[name_of[m]])
        prev = m
    prev = 0
    for m in virtual:
        cd += uleb128(m - prev) + uleb128(access[name_of[m]]) + uleb128(code_off[name_of[m]])
        prev = m
    data += cd

    # map list
    pad4()
    map_off = pos()
    items = [
        (0x0000, 1, 0),
        (0x0001, n_str, string_ids_off),
        (0x0002, n_type, type_ids_off),
        (0x0003, n_proto, proto_ids_off),
        (0x0004, n_field, field_ids_off),
        (0x0005, n_meth, method_ids_off),
        (0x0006, 1, class_defs_off),
        (0x2001, n_code, code_items_start),
        (0x2002, n_str, string_data_start),
        (0x1001, n_type_lists, type_lists_start),
        (0x2000, 1, class_data_start),
        (0x1000, 1, map_off),
    ]
    items = [i for i in items if i[1] > 0]
    items.sort(key=lambda i: i[2])
    data += u32(len(items)) + b''.join(u16(t) + u16(0) + u32(n) + u32(o) for (t, n, o) in items)

    # ---- id sections
    sec = bytearray()
    for i in range(n_str):
        sec += u32(string_data_off[i])
    for t in types:
        sec += u32(sidx[t])
    for pr in protos:
        sec += u32(sidx[shorty(pr[0], list(pr[1]))]) + u32(tidx[pr[0]]) + u32(tl_off.get(pr[1], 0) if pr[1] else 0)
    for f in fields:
        sec += u16(tidx[f[0]]) + u16(tidx[f[2]]) + u32(sidx[f[1]])
    for m in methods:
        sec += u16(tidx[m[0]]) + u16(pidx[(m[2], tuple(m[3]))]) + u32(sidx[m[1]])
    sec += u32(tidx[CLS]) + u32(0x1) + u32(tidx[ACT]) + u32(0) + u32(0xFFFFFFFF) + u32(0) + u32(class_data_start) + u32(0)
    assert 0x70 + len(sec) == data_off

    file_size = data_off + len(data)
    header = bytearray(0x70)
    header[0:8] = b'dex\n035\0'
    struct.pack_into('<I', header, 32, file_size)
    struct.pack_into('<I', header, 36, 0x70)
    struct.pack_into('<I', header, 40, 0x12345678)
    struct.pack_into('<II', header, 44, 0, 0)
    struct.pack_into('<I', header, 52, map_off)
    struct.pack_into('<II', header, 56, n_str, string_ids_off)
    struct.pack_into('<II', header, 64, n_type, type_ids_off)
    struct.pack_into('<II', header, 72, n_proto, proto_ids_off)
    struct.pack_into('<II', header, 80, n_field, field_ids_off)
    struct.pack_into('<II', header, 88, n_meth, method_ids_off)
    struct.pack_into('<II', header, 96, 1, class_defs_off)
    struct.pack_into('<II', header, 104, len(data), data_off)
    dex = bytearray(header + sec + data)
    sha = hashlib.sha1(bytes(dex[32:])).digest()
    dex[12:32] = sha
    struct.pack_into('<I', dex, 8, zlib.adler32(bytes(dex[12:])) & 0xFFFFFFFF)
    return bytes(dex)

# --------------------------------------------------------------------------
# packaging and signing
# --------------------------------------------------------------------------

def ensure_keystore(path, alias, password):
    if os.path.exists(path):
        return
    print('[apk] creating signing key', os.path.relpath(path, ROOT))
    subprocess.run(['keytool', '-genkeypair', '-keystore', path, '-storepass', password, '-keypass', password,
                    '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
                    '-dname', 'CN=Car Dealership Manager Tycoon, O=Independent, C=NL'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'release', 'Car-Dealership-Manager-Tycoon.apk'))
    ap.add_argument('--html', default=os.path.join(ROOT, 'dist', 'android', 'index.html'))
    ap.add_argument('--icon', default=os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png'))
    ap.add_argument('--keystore', default=os.environ.get('CDMT_KEYSTORE') or os.path.join(HERE, 'debug.keystore'))
    ap.add_argument('--alias', default=os.environ.get('CDMT_KEY_ALIAS') or 'cdmt')
    ap.add_argument('--password', default=os.environ.get('CDMT_KEY_PASSWORD') or 'android')
    args = ap.parse_args()

    if not os.path.exists(args.html):
        sys.exit('dist/android/index.html not found — run "npm run build" first.')
    for tool in ('keytool', 'jarsigner'):
        if not shutil.which(tool):
            sys.exit(f'{tool} not found — install a JDK (11 or newer).')

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    unsigned = args.out + '.unsigned'
    with zipfile.ZipFile(unsigned, 'w') as z:
        def add(name, data, compress):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
        add('AndroidManifest.xml', manifest_xml(), True)
        add('classes.dex', build_dex(), True)
        add('resources.arsc', resources_arsc(), False)
        with open(args.icon, 'rb') as f:
            add(ICON_PATH, f.read(), False)
        with open(args.html, 'rb') as f:
            add('assets/www/index.html', f.read(), True)

    ensure_keystore(args.keystore, args.alias, args.password)
    subprocess.run(['jarsigner', '-keystore', args.keystore, '-storepass', args.password, '-keypass', args.password,
                    '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', '-signedjar', args.out, unsigned, args.alias],
                   check=True, stdout=subprocess.DEVNULL)
    os.remove(unsigned)
    subprocess.run(['jarsigner', '-verify', args.out], check=True, stdout=subprocess.DEVNULL)
    size = os.path.getsize(args.out)
    print(f'[apk] {os.path.relpath(args.out, ROOT)} — {size // 1024} KB, signed (v1, SHA-256), package {PACKAGE}')


if __name__ == '__main__':
    main()
