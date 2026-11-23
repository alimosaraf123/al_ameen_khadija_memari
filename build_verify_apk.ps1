$workDir = 'd:\memari_soft\verify_temp'
New-Item -ItemType Directory -Path "$workDir\assets" -Force | Out-Null
Set-Content -Path "$workDir\assets\adi-registration.properties" -Value "verificationToken=DARJ6FB4AYBJEAAAAAAAAAAAAAA`n"

$manifest = '<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.alameenmission.memari">
    <application android:label="Al Ameen Memari">
    </application>
</manifest>'
Set-Content -Path "$workDir\AndroidManifest.xml" -Value $manifest

$aapt2 = 'C:\Users\User\AppData\Local\Android\Sdk\build-tools\36.0.0\aapt2.exe'
$androidJar = 'C:\Users\User\AppData\Local\Android\Sdk\platforms\android-36\android.jar'
$zipalign = 'C:\Users\User\AppData\Local\Android\Sdk\build-tools\36.0.0\zipalign.exe'
$apksigner = 'C:\Users\User\AppData\Local\Android\Sdk\build-tools\36.0.0\apksigner.bat'
$keystore = 'd:\memari_soft\al_ameen_khadija_memari_old\android\app\debug.keystore'

& $aapt2 link -I $androidJar -A "$workDir\assets" -o "$workDir\unaligned.apk" --manifest "$workDir\AndroidManifest.xml"
& $zipalign -f 4 "$workDir\unaligned.apk" "d:\memari_soft\Verification_App.apk"

$env:JAVA_HOME = 'C:\Users\User\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2'
& $apksigner sign --ks $keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android d:\memari_soft\Verification_App.apk
& $apksigner verify --print-certs d:\memari_soft\Verification_App.apk
Write-Output "APK File Size: $((Get-Item 'd:\memari_soft\Verification_App.apk').Length) bytes"

