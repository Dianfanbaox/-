# 构建与本地运行

## HTML

项目无需Node构建或全局前端依赖。可直接打开app/index.html，或使用Python本地服务：

```powershell
python -m http.server 8765 --directory app
```

正式入口：http://127.0.0.1:8765/ 。示例入口：http://127.0.0.1:8765/preview.html ，仅使用虚构数据和独立示例库。浏览器AI请求受正常跨域策略限制。

## Android

工具要求：JDK 17或兼容版本、Android SDK Platform 35、Gradle 8.10.2，工程使用Android Gradle Plugin 8.7.0；最低Android API 24，目标API 35。历史构建记录使用JDK21。

自行安装所需工具并配置SDK位置。android/local.properties属于本机配置，不进入仓库。可通过Android Studio打开android目录配置SDK，或使用已有SDK环境。仓库不附带Gradle二进制分发包和本机签名文件。

在项目根目录运行：

```powershell
.\tools\build-android.ps1
# 如Gradle不在PATH，请指定已有可执行文件：
.\tools\build-android.ps1 -GradlePath 'D:\Tools\gradle-8.10.2\bin\gradle.bat'
```

也可先执行tools/stage-web.ps1，再在Android Studio构建。暂存脚本按白名单生成android/app/src/main/assets-v3，移除示例数据脚本并使用正式数据库；该目录属于生成资源，不提交。

产物：android/app/build/outputs/apk/debug/app-debug.apk。测试包使用构建机器自己的debug签名；不同签名无法覆盖已有安装。发布附件沿用维护者既有签名；不要把签名文件放入仓库。

## 验证

打开app/test.html查看32条财务规则检查。交互验证应在隔离浏览器上下文使用合成数据；避免对真实财务记录执行测试或导入。版本验证摘要见VALIDATION.md。
