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
  classes.dex          Dalvik bytecode for com.cdmt.game.MainActivity (dex_shell.py)
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
VERSION_CODE = 8
VERSION_NAME = '7.1.0'
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
# classes.dex — see dex_shell.py (immersive full-screen WebView shell)
# --------------------------------------------------------------------------

sys.path.insert(0, HERE)
from dex_shell import build_dex  # noqa: E402

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
