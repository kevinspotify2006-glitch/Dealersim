package com.cdmt.game;

import android.app.Activity;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * The whole native side of Car Dealership Manager Tycoon.
 *
 * The game is one self-contained HTML file in assets/www (built by
 * `npm run build`). This activity shows it in a WebView with DOM storage
 * enabled, so saves persist between launches and it works fully offline.
 *
 * Full screen: the status bar and the navigation bar are hidden in sticky
 * immersive mode (a swipe from the edge shows them briefly, then they hide
 * again). Legacy system-UI flags cover every Android version; Android 11+
 * additionally uses WindowInsetsController. Content is drawn edge-to-edge,
 * into the camera cutout, and immersive mode is re-applied whenever the app
 * resumes, regains focus or rotates. The page is told where the cutout is so
 * it can keep buttons clear of it.
 *
 * Back button: the game keeps a browser-history entry whenever it has
 * something to go back to (a dialog, a menu sheet, a previous screen), so
 * WebView.canGoBack() tells us whether back belongs to the game or should
 * leave the app.
 *
 * tools/apk/dex_shell.py emits exactly this class as hand-written Dalvik
 * bytecode, so the APK can be rebuilt without the Android SDK.
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1); // Window.FEATURE_NO_TITLE
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = 1; // LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.setAttributes(lp);
        }
        int background = 0xFF0F1114;
        window.setStatusBarColor(background);
        window.setNavigationBarColor(background);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setTextZoom(100);
        web.setBackgroundColor(background);
        setContentView(web);
        immersive();
        web.loadUrl("file:///android_asset/www/index.html");
    }

    /** Hides the status and navigation bars (sticky immersive, edge-to-edge). */
    private void immersive() {
        Window window = getWindow();
        View decor = window.getDecorView();
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(2); // BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsets.Type.systemBars());
            }
        }
    }

    /** Passes the camera cutout's safe insets (device pixels) to the page. */
    private void reportInsets() {
        if (Build.VERSION.SDK_INT < 28 || web == null) return;
        WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
        if (insets == null) return;
        DisplayCutout cutout = insets.getDisplayCutout();
        if (cutout == null) return;
        web.loadUrl("javascript:window.cdmInsets&&window.cdmInsets(" + cutout.getSafeInsetTop() + ","
                + cutout.getSafeInsetRight() + "," + cutout.getSafeInsetBottom() + "," + cutout.getSafeInsetLeft() + ")");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            immersive();
            reportInsets();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        immersive();
    }

    @Override
    protected void onResume() {
        super.onResume();
        immersive();
        if (web != null) web.loadUrl("javascript:window.cdmResume&&window.cdmResume()");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            // Autosave whenever the app leaves the foreground.
            web.loadUrl("javascript:window.cdmSave&&window.cdmSave()");
        }
    }
}
