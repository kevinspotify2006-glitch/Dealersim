"""
classes.dex for com.cdmt.game.MainActivity, written by hand (no Android SDK).

The Java equivalent is android/app/src/main/java/com/cdmt/game/MainActivity.java.
Every method below mirrors that file line by line.

What the shell does:
  * hosts the game (one HTML file in assets/www) in a WebView with DOM storage,
  * runs truly full screen: status bar and navigation bar hidden in sticky
    immersive mode (legacy flags on every Android, WindowInsetsController on
    Android 11+), drawn edge-to-edge into the display cutout (Android 9+),
  * re-applies immersive mode on resume, focus and orientation changes,
  * tells the page where the camera cutout is (safe insets in device pixels),
  * routes Back to the game first and autosaves when the app is paused.

A tiny two-pass assembler resolves branch labels, so offsets are never
counted by hand. tools/apk/verify_apk.py independently re-reads the result
and type-checks every instruction.
"""
import hashlib
import struct
import zlib

CLS = 'Lcom/cdmt/game/MainActivity;'
ACT = 'Landroid/app/Activity;'
WEB = 'Landroid/webkit/WebView;'
SET = 'Landroid/webkit/WebSettings;'
WIN = 'Landroid/view/Window;'
VIEW = 'Landroid/view/View;'
CTX = 'Landroid/content/Context;'
BUNDLE = 'Landroid/os/Bundle;'
CONFIG = 'Landroid/content/res/Configuration;'
LP = 'Landroid/view/WindowManager$LayoutParams;'
VERSION = 'Landroid/os/Build$VERSION;'
WIC = 'Landroid/view/WindowInsetsController;'
WIT = 'Landroid/view/WindowInsets$Type;'
WINS = 'Landroid/view/WindowInsets;'
CUT = 'Landroid/view/DisplayCutout;'
SB = 'Ljava/lang/StringBuilder;'
STR = 'Ljava/lang/String;'

URL = 'file:///android_asset/www/index.html'
JS_SAVE = 'javascript:window.cdmSave&&window.cdmSave()'
JS_RESUME = 'javascript:window.cdmResume&&window.cdmResume()'
JS_INSETS = 'javascript:window.cdmInsets&&window.cdmInsets('

BG_COLOR = 0xFF0F1114
FLAG_KEEP_SCREEN_ON = 0x80
# SYSTEM_UI_FLAG_LAYOUT_STABLE | LAYOUT_HIDE_NAVIGATION | LAYOUT_FULLSCREEN
# | HIDE_NAVIGATION | FULLSCREEN | IMMERSIVE_STICKY
IMMERSIVE_FLAGS = 0x0100 | 0x0200 | 0x0400 | 0x0002 | 0x0004 | 0x1000
CUTOUT_SHORT_EDGES = 1
BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE = 2

# (class, name, return, params) — every method the bytecode references.
METHODS = [
    (ACT, '<init>', 'V', []),
    (ACT, 'onCreate', 'V', [BUNDLE]),
    (ACT, 'onBackPressed', 'V', []),
    (ACT, 'onPause', 'V', []),
    (ACT, 'onResume', 'V', []),
    (ACT, 'onWindowFocusChanged', 'V', ['Z']),
    (ACT, 'onConfigurationChanged', 'V', [CONFIG]),
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
    (WIN, 'addFlags', 'V', ['I']),
    (WIN, 'getAttributes', LP, []),
    (WIN, 'setAttributes', 'V', [LP]),
    (WIN, 'getDecorView', VIEW, []),
    (WIN, 'setDecorFitsSystemWindows', 'V', ['Z']),
    (WIN, 'getInsetsController', WIC, []),
    (VIEW, 'setSystemUiVisibility', 'V', ['I']),
    (VIEW, 'getRootWindowInsets', WINS, []),
    (WINS, 'getDisplayCutout', CUT, []),
    (CUT, 'getSafeInsetTop', 'I', []),
    (CUT, 'getSafeInsetRight', 'I', []),
    (CUT, 'getSafeInsetBottom', 'I', []),
    (CUT, 'getSafeInsetLeft', 'I', []),
    (WIC, 'setSystemBarsBehavior', 'V', ['I']),
    (WIC, 'hide', 'V', ['I']),
    (WIT, 'systemBars', 'I', []),
    (SB, '<init>', 'V', [STR]),
    (SB, 'append', SB, ['I']),
    (SB, 'append', SB, [STR]),
    (SB, 'toString', STR, []),
    (CLS, '<init>', 'V', []),
    (CLS, 'immersive', 'V', []),
    (CLS, 'reportInsets', 'V', []),
    (CLS, 'onCreate', 'V', [BUNDLE]),
    (CLS, 'onBackPressed', 'V', []),
    (CLS, 'onPause', 'V', []),
    (CLS, 'onResume', 'V', []),
    (CLS, 'onWindowFocusChanged', 'V', ['Z']),
    (CLS, 'onConfigurationChanged', 'V', [CONFIG]),
]
# (class, name, type, is our own instance field)
FIELDS = [
    (CLS, 'web', WEB, True),
    (VERSION, 'SDK_INT', 'I', False),
    (LP, 'layoutInDisplayCutoutMode', 'I', False),
]
STRINGS_EXTRA = [URL, JS_SAVE, JS_RESUME, JS_INSETS, ',', ')']

# name -> (access flags, direct?)
OWN = {
    '<init>': (0x10001, True),
    'immersive': (0x2, True),
    'reportInsets': (0x2, True),
    'onCreate': (0x4, False),
    'onBackPressed': (0x1, False),
    'onPause': (0x4, False),
    'onResume': (0x4, False),
    'onWindowFocusChanged': (0x1, False),
    'onConfigurationChanged': (0x1, False),
}


def u16(v): return struct.pack('<H', v & 0xFFFF)
def u32(v): return struct.pack('<I', v & 0xFFFFFFFF)


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


def shorty(ret, params):
    def c(t):
        return 'L' if t.startswith('L') or t.startswith('[') else t
    return c(ret) + ''.join(c(p) for p in params)


class Asm:
    """Collects instructions; branches refer to labels and are resolved at the end."""

    def __init__(self, ctx):
        self.ctx = ctx
        self.items = []

    # --- plumbing
    def _emit(self, units):
        self.items.append(('units', units))

    def label(self, name):
        self.items.append(('label', name))

    def code(self):
        pos = 0
        labels = {}
        for kind, v in self.items:
            if kind == 'label':
                labels[v] = pos
            elif kind == 'units':
                pos += len(v)
            else:
                pos += 2
        out = []
        pos = 0
        for kind, v in self.items:
            if kind == 'label':
                continue
            if kind == 'units':
                out += v
                pos += len(v)
            else:
                op, a, b, target = v
                off = labels[target] - pos
                assert -32768 <= off <= 32767 and off != 0
                if op in (0x38, 0x39):          # if-eqz / if-nez (21t)
                    out += [(a << 8) | op, off & 0xFFFF]
                else:                           # if-lt etc. (22t)
                    out += [(b << 12) | (a << 8) | op, off & 0xFFFF]
                pos += 2
        return out

    # --- instructions
    def invoke(self, op, cls, name, ret, params, regs):
        m = self.ctx.method(cls, name, ret, params)
        a = len(regs)
        assert a <= 5
        r = list(regs) + [0] * (5 - len(regs))
        self._emit([(a << 12) | (r[4] << 8) | op, m, (r[3] << 12) | (r[2] << 8) | (r[1] << 4) | r[0]])

    def virtual(self, *a): self.invoke(0x6e, *a)
    def super_(self, *a): self.invoke(0x6f, *a)
    def direct(self, *a): self.invoke(0x70, *a)
    def static(self, *a): self.invoke(0x71, *a)
    def interface(self, *a): self.invoke(0x72, *a)

    def move_result(self, a): self._emit([(a << 8) | 0x0a])
    def move_result_object(self, a): self._emit([(a << 8) | 0x0c])

    def const(self, a, v):
        if -8 <= v <= 7 and a < 16:
            self._emit([((v & 0xF) << 12) | (a << 8) | 0x12])
        elif -32768 <= v <= 32767:
            self._emit([(a << 8) | 0x13, v & 0xFFFF])
        else:
            self._emit([(a << 8) | 0x14, v & 0xFFFF, (v >> 16) & 0xFFFF])

    def const_string(self, a, s): self._emit([(a << 8) | 0x1a, self.ctx.sidx[s]])
    def new_instance(self, a, t): self._emit([(a << 8) | 0x22, self.ctx.tidx[t]])
    def iget_object(self, a, b, f): self._emit([(b << 12) | (a << 8) | 0x54, self.ctx.field(*f)])
    def iput_object(self, a, b, f): self._emit([(b << 12) | (a << 8) | 0x5b, self.ctx.field(*f)])
    def iput(self, a, b, f): self._emit([(b << 12) | (a << 8) | 0x59, self.ctx.field(*f)])
    def sget(self, a, f): self._emit([(a << 8) | 0x60, self.ctx.field(*f)])
    def if_eqz(self, a, target): self.items.append(('branch', (0x38, a, 0, target)))
    def if_lt(self, a, b, target): self.items.append(('branch', (0x34, a, b, target)))
    def return_void(self): self._emit([0x000e])


class Ctx:
    def __init__(self):
        types = {'V', 'Z', 'I'}
        for (c, n, r, p) in METHODS:
            types.add(c)
            if r not in ('V', 'Z', 'I'):
                types.add(r)
            types.update(x for x in p if x not in ('V', 'Z', 'I'))
        for (c, n, t, _own) in FIELDS:
            types.add(c)
            types.add(t)
        strings = set(types)
        protos = set()
        for (c, n, r, p) in METHODS:
            strings.add(n)
            strings.add(shorty(r, p))
            protos.add((r, tuple(p)))
        for (c, n, t, _own) in FIELDS:
            strings.add(n)
        strings.update(STRINGS_EXTRA)
        # string_ids are sorted by UTF-16 code units; every string here is ASCII.
        self.strings = sorted(strings, key=lambda s: [ord(ch) for ch in s])
        self.sidx = {s: i for i, s in enumerate(self.strings)}
        self.types = sorted(types, key=lambda t: self.sidx[t])
        self.tidx = {t: i for i, t in enumerate(self.types)}
        self.protos = sorted(protos, key=lambda pr: (self.tidx[pr[0]], [self.tidx[x] for x in pr[1]]))
        self.pidx = {p: i for i, p in enumerate(self.protos)}
        self.fields = sorted(FIELDS, key=lambda f: (self.tidx[f[0]], self.sidx[f[1]], self.tidx[f[2]]))
        self.fidx = {(f[0], f[1]): i for i, f in enumerate(self.fields)}
        self.methods = sorted(METHODS, key=lambda m: (self.tidx[m[0]], self.sidx[m[1]], self.pidx[(m[2], tuple(m[3]))]))
        self.midx = {(m[0], m[1], m[2], tuple(m[3])): i for i, m in enumerate(self.methods)}

    def method(self, cls, name, ret, params=()):
        return self.midx[(cls, name, ret, tuple(params))]

    def field(self, cls, name):
        return self.fidx[(cls, name)]


WEB_F = (CLS, 'web')
SDK_F = (VERSION, 'SDK_INT')
CUTOUT_F = (LP, 'layoutInDisplayCutoutMode')


def method_bodies(ctx):
    """Returns name -> (registers, ins, outs, code units)."""
    bodies = {}

    # public MainActivity() { super(); }      registers: v0 = this
    a = Asm(ctx)
    a.direct(ACT, '<init>', 'V', [], [0])
    a.return_void()
    bodies['<init>'] = (1, 1, 1, a.code())

    # protected void onCreate(Bundle b)       v0..v3 locals, v4 = this, v5 = bundle
    a = Asm(ctx)
    a.super_(ACT, 'onCreate', 'V', [BUNDLE], [4, 5])
    a.const(0, 1)
    a.virtual(ACT, 'requestWindowFeature', 'Z', ['I'], [4, 0])      # FEATURE_NO_TITLE
    a.virtual(ACT, 'getWindow', WIN, [], [4])
    a.move_result_object(1)
    a.const(0, FLAG_KEEP_SCREEN_ON)
    a.virtual(WIN, 'addFlags', 'V', ['I'], [1, 0])
    a.sget(0, SDK_F)
    a.const(2, 28)
    a.if_lt(0, 2, 'no_cutout')                                    # Android 9+: draw into the camera cutout
    a.virtual(WIN, 'getAttributes', LP, [], [1])
    a.move_result_object(2)
    a.const(3, CUTOUT_SHORT_EDGES)
    a.iput(3, 2, CUTOUT_F)
    a.virtual(WIN, 'setAttributes', 'V', [LP], [1, 2])
    a.label('no_cutout')
    a.const(3, BG_COLOR - (1 << 32) if BG_COLOR >= (1 << 31) else BG_COLOR)
    a.virtual(WIN, 'setStatusBarColor', 'V', ['I'], [1, 3])
    a.virtual(WIN, 'setNavigationBarColor', 'V', ['I'], [1, 3])
    a.new_instance(0, WEB)
    a.direct(WEB, '<init>', 'V', [CTX], [0, 4])
    a.iput_object(0, 4, WEB_F)
    a.virtual(WEB, 'getSettings', SET, [], [0])
    a.move_result_object(1)
    a.const(2, 1)
    a.virtual(SET, 'setJavaScriptEnabled', 'V', ['Z'], [1, 2])
    a.virtual(SET, 'setDomStorageEnabled', 'V', ['Z'], [1, 2])
    a.virtual(SET, 'setAllowFileAccess', 'V', ['Z'], [1, 2])
    a.const(2, 0)
    a.virtual(SET, 'setMediaPlaybackRequiresUserGesture', 'V', ['Z'], [1, 2])
    a.const(2, 100)
    a.virtual(SET, 'setTextZoom', 'V', ['I'], [1, 2])
    a.virtual(WEB, 'setBackgroundColor', 'V', ['I'], [0, 3])
    a.virtual(ACT, 'setContentView', 'V', [VIEW], [4, 0])
    a.direct(CLS, 'immersive', 'V', [], [4])
    a.const_string(1, URL)
    a.virtual(WEB, 'loadUrl', 'V', [STR], [0, 1])
    a.return_void()
    bodies['onCreate'] = (6, 2, 2, a.code())

    # private void immersive()                v0 window, v1 view/controller, v2-v3 ints, v4 = this
    a = Asm(ctx)
    a.virtual(ACT, 'getWindow', WIN, [], [4])
    a.move_result_object(0)
    a.virtual(WIN, 'getDecorView', VIEW, [], [0])
    a.move_result_object(1)
    a.const(2, IMMERSIVE_FLAGS)
    a.virtual(VIEW, 'setSystemUiVisibility', 'V', ['I'], [1, 2])
    a.sget(2, SDK_F)
    a.const(3, 30)
    a.if_lt(2, 3, 'done')                                         # Android 11+: WindowInsetsController
    a.const(2, 0)
    a.virtual(WIN, 'setDecorFitsSystemWindows', 'V', ['Z'], [0, 2])
    a.virtual(WIN, 'getInsetsController', WIC, [], [0])
    a.move_result_object(1)
    a.if_eqz(1, 'done')
    a.const(2, BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)
    a.interface(WIC, 'setSystemBarsBehavior', 'V', ['I'], [1, 2])
    a.static(WIT, 'systemBars', 'I', [], [])
    a.move_result(2)
    a.interface(WIC, 'hide', 'V', ['I'], [1, 2])
    a.label('done')
    a.return_void()
    bodies['immersive'] = (5, 1, 2, a.code())

    # private void reportInsets()             v0 web, v1 view/insets/cutout, v2 builder, v3-v4 strings, v5 int, v6 = this
    a = Asm(ctx)
    a.sget(0, SDK_F)
    a.const(1, 28)
    a.if_lt(0, 1, 'done')
    a.iget_object(0, 6, WEB_F)
    a.if_eqz(0, 'done')
    a.virtual(ACT, 'getWindow', WIN, [], [6])
    a.move_result_object(1)
    a.virtual(WIN, 'getDecorView', VIEW, [], [1])
    a.move_result_object(1)
    a.virtual(VIEW, 'getRootWindowInsets', WINS, [], [1])
    a.move_result_object(1)
    a.if_eqz(1, 'done')
    a.virtual(WINS, 'getDisplayCutout', CUT, [], [1])
    a.move_result_object(1)
    a.if_eqz(1, 'done')
    a.new_instance(2, SB)
    a.const_string(3, JS_INSETS)
    a.direct(SB, '<init>', 'V', [STR], [2, 3])
    a.const_string(4, ',')
    for k, getter in enumerate(['getSafeInsetTop', 'getSafeInsetRight', 'getSafeInsetBottom', 'getSafeInsetLeft']):
        a.virtual(CUT, getter, 'I', [], [1])
        a.move_result(5)
        a.virtual(SB, 'append', SB, ['I'], [2, 5])
        if k < 3:
            a.virtual(SB, 'append', SB, [STR], [2, 4])
    a.const_string(3, ')')
    a.virtual(SB, 'append', SB, [STR], [2, 3])
    a.virtual(SB, 'toString', STR, [], [2])
    a.move_result_object(3)
    a.virtual(WEB, 'loadUrl', 'V', [STR], [0, 3])
    a.label('done')
    a.return_void()
    bodies['reportInsets'] = (7, 1, 2, a.code())

    # public void onBackPressed()             v0 web, v1 flag, v2 = this
    a = Asm(ctx)
    a.iget_object(0, 2, WEB_F)
    a.if_eqz(0, 'app')
    a.virtual(WEB, 'canGoBack', 'Z', [], [0])
    a.move_result(1)
    a.if_eqz(1, 'app')
    a.virtual(WEB, 'goBack', 'V', [], [0])
    a.return_void()
    a.label('app')
    a.super_(ACT, 'onBackPressed', 'V', [], [2])
    a.return_void()
    bodies['onBackPressed'] = (3, 1, 1, a.code())

    # protected void onPause()                v0 web, v1 url, v2 = this
    a = Asm(ctx)
    a.super_(ACT, 'onPause', 'V', [], [2])
    a.iget_object(0, 2, WEB_F)
    a.if_eqz(0, 'done')
    a.const_string(1, JS_SAVE)
    a.virtual(WEB, 'loadUrl', 'V', [STR], [0, 1])
    a.label('done')
    a.return_void()
    bodies['onPause'] = (3, 1, 2, a.code())

    # protected void onResume()               v0 web, v1 url, v2 = this
    a = Asm(ctx)
    a.super_(ACT, 'onResume', 'V', [], [2])
    a.direct(CLS, 'immersive', 'V', [], [2])
    a.iget_object(0, 2, WEB_F)
    a.if_eqz(0, 'done')
    a.const_string(1, JS_RESUME)
    a.virtual(WEB, 'loadUrl', 'V', [STR], [0, 1])
    a.label('done')
    a.return_void()
    bodies['onResume'] = (3, 1, 2, a.code())

    # public void onWindowFocusChanged(boolean hasFocus)   v0 = this, v1 = hasFocus
    a = Asm(ctx)
    a.super_(ACT, 'onWindowFocusChanged', 'V', ['Z'], [0, 1])
    a.if_eqz(1, 'done')
    a.direct(CLS, 'immersive', 'V', [], [0])
    a.direct(CLS, 'reportInsets', 'V', [], [0])
    a.label('done')
    a.return_void()
    bodies['onWindowFocusChanged'] = (2, 2, 2, a.code())

    # public void onConfigurationChanged(Configuration c)  v0 = this, v1 = config
    a = Asm(ctx)
    a.super_(ACT, 'onConfigurationChanged', 'V', [CONFIG], [0, 1])
    a.direct(CLS, 'immersive', 'V', [], [0])
    a.return_void()
    bodies['onConfigurationChanged'] = (2, 2, 2, a.code())
    return bodies


def build_dex():
    ctx = Ctx()
    bodies = method_bodies(ctx)
    own = {n: ctx.method(CLS, n, r, p) for (c, n, r, p) in METHODS if c == CLS}
    strings, types, protos, fields, methods = ctx.strings, ctx.types, ctx.protos, ctx.fields, ctx.methods
    sidx, tidx, pidx = ctx.sidx, ctx.tidx, ctx.pidx

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

    # code items (4-byte aligned)
    pad4()
    code_off = {}
    code_items_start = pos()
    order = sorted(bodies, key=lambda n: own[n])
    for name in order:
        pad4()
        regs, ins, outs, insns = bodies[name]
        code_off[name] = pos()
        data += u16(regs) + u16(ins) + u16(outs) + u16(0) + u32(0) + u32(len(insns))
        data += b''.join(u16(x) for x in insns)

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

    # class data
    class_data_start = pos()
    direct = sorted(own[n] for n in bodies if OWN[n][1])
    virtual = sorted(own[n] for n in bodies if not OWN[n][1])
    name_of = {own[n]: n for n in bodies}
    own_fields = sorted(ctx.fidx[(f[0], f[1])] for f in FIELDS if f[3])
    cd = uleb128(0) + uleb128(len(own_fields)) + uleb128(len(direct)) + uleb128(len(virtual))
    prev = 0
    for f in own_fields:
        cd += uleb128(f - prev) + uleb128(0x2)       # private
        prev = f
    for group in (direct, virtual):
        prev = 0
        for m in group:
            n = name_of[m]
            cd += uleb128(m - prev) + uleb128(OWN[n][0]) + uleb128(code_off[n])
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
        (0x2001, len(bodies), code_items_start),
        (0x2002, n_str, string_data_start),
        (0x1001, len(tl_off), type_lists_start),
        (0x2000, 1, class_data_start),
        (0x1000, 1, map_off),
    ]
    items = [i for i in items if i[1] > 0]
    items.sort(key=lambda i: i[2])
    data += u32(len(items)) + b''.join(u16(t) + u16(0) + u32(n) + u32(o) for (t, n, o) in items)
    pad4()

    # id sections
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
    dex[12:32] = hashlib.sha1(bytes(dex[32:])).digest()
    struct.pack_into('<I', dex, 8, zlib.adler32(bytes(dex[12:])) & 0xFFFFFFFF)
    return bytes(dex)
