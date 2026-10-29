import cv2

img = cv2.imread('d:/memari_soft/omr_scans/1793235354682_1_m0002.jpg')
std = cv2.resize(img, (724, 1024))
cv2.imwrite('d:/memari_soft/omr_scans/header_m0002.jpg', std[0:550, 0:724])
print("Saved header_m0002.jpg")
