package fit.getascend.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class HealthConnectPermissionsRationaleActivity : AppCompatActivity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = WebView(this).apply {
            settings.javaScriptEnabled = false
            setBackgroundColor(0xFF0B1020.toInt())
            webViewClient = WebViewClient()
            loadUrl("https://www.getascend.fit/privacy")
        }
        setContentView(webView)
    }
}
