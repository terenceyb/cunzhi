package cn.evanhub.cunzhi;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * 存知安卓端原生能力：
 * 1. setStatusBar —— 把系统状态栏/导航栏底色同步为应用主界面背景色，
 *    并随深浅主题切换图标明暗；全面屏下状态栏由系统绘制在 cutout 区域。
 * 2. pickPackage —— 调用 Android SAF（ACTION_OPEN_DOCUMENT）让用户从设备
 *    文件浏览器的任意文件夹选择 .czdb，读流复制一份到应用专属 cunzhi 文件夹，
 *    之后应用始终读写这份副本，不再依赖原文件的临时授权。
 */
@CapacitorPlugin(name = "CunzhiNative")
public class CunzhiNativePlugin extends Plugin {

    /**
     * 安装后首次打开判定。用 SharedPreferences 同步 commit 落盘，
     * 即使用户在启动页立刻杀进程，下次打开也不会重复展示。
     * 结果在 JS 侧按进程缓存，避免 React 严格模式下重复消耗首次标记。
     */
    @PluginMethod
    public void isFirstLaunch(PluginCall call) {
        SharedPreferences sp = getContext().getSharedPreferences("cunzhi_launch", Context.MODE_PRIVATE);
        boolean first = !sp.getBoolean("launch_seen", false);
        if (first) {
            sp.edit().putBoolean("launch_seen", true).commit();
        }
        JSObject res = new JSObject();
        res.put("first", first);
        call.resolve(res);
    }

    @PluginMethod
    public void setStatusBar(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", "#f3f4f6"));
        } catch (IllegalArgumentException e) {
            call.reject("无效的状态栏颜色");
            return;
        }
        final boolean lightIcons = call.getBoolean("light", true);

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(lightIcons);
                controller.setAppearanceLightNavigationBars(lightIcons);
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void pickPackage(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/json", "application/octet-stream", "text/plain"
        });
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handlePickPackage");
    }

    @ActivityCallback
    private void handlePickPackage(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("cancelled");
            return;
        }

        String name = queryDisplayName(uri);
        if (name == null || name.isEmpty()) name = "导入数据包.czdb";
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (!name.toLowerCase(Locale.US).endsWith(".czdb")) name = name + ".czdb";

        File dir = new File(getActivity().getExternalFilesDir(null), "cunzhi");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("无法创建本地数据文件夹");
            return;
        }
        File dest = new File(dir, name);
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
             OutputStream out = new FileOutputStream(dest, false)) {
            if (in == null) {
                call.reject("无法读取所选文件");
                return;
            }
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
            out.flush();
        } catch (IOException e) {
            call.reject("复制数据包失败：" + e.getMessage());
            return;
        }

        JSObject res = new JSObject();
        res.put("name", name);
        res.put("path", "cunzhi/" + name);
        res.put("size", dest.length());
        call.resolve(res);
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(
                uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null
            );
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {
            // 某些文件管理器不提供 DISPLAY_NAME，使用兜底文件名
        } finally {
            if (cursor != null) cursor.close();
        }
        return null;
    }
}
