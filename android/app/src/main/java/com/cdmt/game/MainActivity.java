package com.cdmt.game;

import android.app.Activity;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * The whole native side of Car Dealership Manager Tycoon.
 *
 * The game is one self-contained HTML file in assets/www (built by
 * `npm run build`). This activity shows it full-screen in a WebView with
 * DOM storage enabled, so saves persist between launches, and it works
 * with no network connection at all.
 *
 * Back button: the game keeps a browser-history entry whenever it has
 * something to go back to (a dialog, a menu sheet, a previous screen), so
 * WebView.canGoBack() tells us whether back belongs to the game or should
 * leave the app.
 *
 * tools/apk/build_apk.py emits exactly this class as hand-written Dalvik
 * bytecode, so the APK can be rebuilt without the Android SDK.
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setTextZoom(100);
        int background = 0xFF0F1114;
        web.setBackgroundColor(background);
        Window window = getWindow();
        window.setStatusBarColor(background);
        window.setNavigationBarColor(background);
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
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
