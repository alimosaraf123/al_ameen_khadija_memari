import zipfile
import subprocess
import os

src_apk = 'd:/memari_soft/al_ameen_khadija_memari_old/android/app/build/outputs/apk/release/app-release.apk'
unaligned_apk = 'd:/memari_soft/temp_unaligned.apk'
aligned_apk = 'd:/memari_soft/Verification_App.apk'

with zipfile.ZipFile(src_apk, 'r') as zin:
    with zipfile.ZipFile(unaligned_apk, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename.startswith('META-INF/'):
                continue
            if item.filename == 'assets/adi-registration.properties':
                continue
            zout.writestr(item, zin.read(item.filename))
        # Write the new adi-registration.properties with \n
        zout.writestr('assets/adi-registration.properties', b'DARJ6FB4AYBJEAAAAAAAAAAAAAA\n')

# Align
zipalign = r'C:\Users\User\AppData\Local\Android\Sdk\build-tools\36.0.0\zipalign.exe'
subprocess.check_call([zipalign, '-f', '4', unaligned_apk, aligned_apk])

# Sign
keystore = r'd:\memari_soft\al_ameen_khadija_memari_old\android\app\debug.keystore'
apksigner = r'C:\Users\User\AppData\Local\Android\Sdk\build-tools\36.0.0\apksigner.bat'
env = os.environ.copy()
env['JAVA_HOME'] = r'C:\Users\User\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2'

subprocess.check_call([
    apksigner, 'sign',
    '--ks', keystore,
    '--ks-pass', 'pass:android',
    '--ks-key-alias', 'androiddebugkey',
    '--key-pass', 'pass:android',
    aligned_apk
], env=env)

# Verify
out = subprocess.check_output([
    apksigner, 'verify', '--print-certs', aligned_apk
], env=env)
print("Signer verification:")
print(out.decode())
print("APK Size:", os.path.getsize(aligned_apk))

