import cv2
import numpy as np

def detect_reg_offset(img_path):
    img = cv2.imread(img_path)
    std = cv2.resize(img, (724, 1024))
    gray = cv2.cvtColor(std, cv2.COLOR_BGR2GRAY)
    
    import omr_engine as oe
    rx, ry, rw, rh = oe.locate_registration_box(std)
    
    digits = []
    for c in range(10):
        cx = rx + int((c + 0.5) * (rw / 10.0))
        row_means = []
        for r in range(10):
            cy = ry + int(rh * 0.245 + (r + 0.5) * (rh * 0.725 / 10.0))
            roi = gray[cy-4:cy+4, cx-4:cx+4]
            row_means.append(float(np.mean(roi)))
            
        min_r = int(np.argmin(row_means))
        min_val = row_means[min_r]
        avg_val = float(np.mean(row_means))
        
        diff = avg_val - min_val
        sorted_means = sorted(row_means)
        contrast = sorted_means[1] - min_val
        
        if diff >= 8.0 and min_val < 205 and contrast >= 5.0:
            digits.append(str(min_r))
        else:
            digits.append('-')
            
    clean = ''.join(digits)
    print(f"{img_path.split('/')[-1]} -> Detected: '{clean}'")

detect_reg_offset('d:/memari_soft/omr_scans/1793235354659_ddd.jpg')
detect_reg_offset('d:/memari_soft/omr_scans/1793235354671_1_m0001.jpg')
detect_reg_offset('d:/memari_soft/omr_scans/1793235354682_1_m0002.jpg')
