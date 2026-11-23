import zipfile

z = zipfile.ZipFile('d:/memari_soft/Verification_App.apk')
for n in z.namelist():
    if 'adi' in n.lower():
        print("Found entry:", n)
        content = z.read(n)
        print("Content bytes:", repr(content))
        print("Content str:", content.decode('utf-8', errors='ignore'))

