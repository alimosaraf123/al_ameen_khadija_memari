import cv2
import os

folder = 'd:/memari_soft/omr_scans'
for f in os.listdir(folder):
    if f.endswith('.jpg'):
        p = os.path.join(folder, f)
        img = cv2.imread(p)
        print(f, "Shape:", img.shape if img is not None else "None")
