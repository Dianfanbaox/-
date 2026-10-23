package com.qianyoushu.app;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.*;
import android.widget.Toast;
import android.widget.FrameLayout;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView webView;
    private AiHttpBridge aiHttpBridge;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        int bg=Color.parseColor("#FAF9F5");
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR |
            (android.os.Build.VERSION.SDK_INT>=26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0));
        webView=new WebView(this);
        webView.setBackgroundColor(bg);
        FrameLayout container=new FrameLayout(this);
        container.setBackgroundColor(bg);
        container.addView(webView,new FrameLayout.LayoutParams(-1,-1));
        container.setOnApplyWindowInsetsListener((view,insets)->{
            view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(container);
        container.requestApplyInsets();
        WebSettings settings=webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new BackupBridge(),"QYSAndroid");
        aiHttpBridge = new AiHttpBridge(this, webView);
        webView.addJavascriptInterface(aiHttpBridge,"QYSAndroidAI");
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
            @Override public void onPageFinished(WebView view,String url){
                if(!url.startsWith("file:///android_asset/index.html"))return;
                view.evaluateJavascript("if(typeof App!=='undefined'&&window.QYSAndroid){App.exportBackup=async function(){try{const p=await DB.exportAll();QYSAndroid.saveBackup(JSON.stringify(p,null,2),'QianYouShu_Backup_'+new Date().toISOString().slice(0,10)+'.json');}catch(e){toast('导出失败：'+e.message);}};}",null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);
                fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
                try{startActivityForResult(intent,101);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;message("无法打开文件选择器");}
                return true;
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }
    private void message(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    private final class BackupBridge {
        @JavascriptInterface public void saveBackup(String json,String name){
            runOnUiThread(()->{
                if(pendingBackup!=null){message("请先完成当前备份保存");return;}
                pendingBackup=json;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE,name);
                try{startActivityForResult(intent,102);}catch(Exception e){pendingBackup=null;message("无法打开保存位置");}
            });
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==101&&fileCallback!=null){
            Uri uri=result==RESULT_OK&&data!=null?data.getData():null;
            fileCallback.onReceiveValue(uri==null?null:new Uri[]{uri});
            fileCallback=null;
        }
        if(request==102){
            String content=pendingBackup;
            pendingBackup=null;
            if(result!=RESULT_OK||data==null||data.getData()==null||content==null)return;
            Uri destination=data.getData();
            new Thread(()->{
                try(OutputStream stream=getContentResolver().openOutputStream(destination,"wt")){
                    if(stream==null)throw new java.io.IOException();
                    stream.write(content.getBytes(StandardCharsets.UTF_8));
                    runOnUiThread(()->message("备份已保存"));
                }catch(Exception e){runOnUiThread(()->message("备份保存失败，请重新选择保存位置"));}
            },"qys-backup").start();
        }
    }
    @Override protected void onDestroy(){
        if(aiHttpBridge != null) aiHttpBridge.close();
        super.onDestroy();
    }
    @Override public void onBackPressed(){
        webView.evaluateJavascript("(function(){return !!(window.QYSInteractions && window.QYSInteractions.handleBack());})()", handled -> {
            if (!"true".equals(handled)) {
                if (webView.canGoBack()) webView.goBack();
                else MainActivity.super.onBackPressed();
            }
        });
    }
}