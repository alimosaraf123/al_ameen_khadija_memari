import cv2
import os

folder = 'd:/memari_soft/omr_scans'
for f in ['1793235354659_ddd.jpg', '1793235354671_1_m0001.jpg', '1793235354682_1_m0002.jpg']:
    p = os.path.join(folder, f)
    img = cv2.imread(p)
    std = cv2.resize(img, (724, 1024))
    crop_reg = std[190:460, 65:250]
    out_p = os.path.join(folder, f'crop_check_{f}')
    cv2.imwrite(out_p, crop_reg)
    print("Saved crop for", f)
