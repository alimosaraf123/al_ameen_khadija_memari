import cv2
import numpy as np

img = cv2.imread('d:/memari_soft/omr_scans/1793235354682_1_m0002.jpg')
std = cv2.resize(img, (724, 1024))
gray = cv2.cvtColor(std, cv2.COLOR_BGR2GRAY)

rx, ry, rw, rh = 70, 220, 177, 245

for c in range(10):
    cx = rx + int((c + 0.5) * (rw / 10.0))
    means = []
    for r in range(10):
        # Let's test y from 277 to 425 with step ~16.2
        cy = int(277 + r * 16.2)
        roi = gray[cy-4:cy+4, cx-4:cx+4]
        means.append(round(float(np.mean(roi)), 1))
    min_r = int(np.argmin(means))
    print(f"Col {c+1}: min row={min_r} (val={means[min_r]}), min vs avg={round(np.mean(means)-means[min_r], 1)}")
