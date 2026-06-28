# Keep WebView JavaScript bridge methods intact for Capacitor plugins.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve plugin classes discovered via reflection by Capacitor and Firebase auth.
-keep class com.getcapacitor.** { *; }
-keep class io.capawesome.capacitorjs.plugins.firebase.authentication.** { *; }

# The Firebase auth plugin references optional Facebook auth classes. Ascend does
# not ship Facebook login, so suppress these release-only shrinker warnings.
-dontwarn com.facebook.AccessToken
-dontwarn com.facebook.CallbackManager$Factory
-dontwarn com.facebook.CallbackManager
-dontwarn com.facebook.FacebookCallback
-dontwarn com.facebook.FacebookException
-dontwarn com.facebook.login.LoginManager
-dontwarn com.facebook.login.LoginResult
-dontwarn com.facebook.login.widget.LoginButton

# Keep source line numbers to make Play Console crash traces actionable.
-keepattributes SourceFile,LineNumberTable
