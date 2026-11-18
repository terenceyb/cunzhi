package cn.evanhub.cunzhi;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super 之前注册，Capacitor 会在 Bridge 初始化时绑定插件
        registerPlugin(CunzhiNativePlugin.class);
        super.onCreate(savedInstanceState);

        // WebView 渲染线程提优先级：列表滚动与弹层动画在低端机上更少掉帧
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null && webView.getSettings() != null) {
            webView.getSettings().setRenderPriority(WebSettings.RenderPriority.HIGH);
        }
    }
}
