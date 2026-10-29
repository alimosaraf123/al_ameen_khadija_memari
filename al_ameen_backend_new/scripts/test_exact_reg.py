import cv2
import numpy as np

def detect_reg_exact(img_path):
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
            cy = ry + int(rh * 0.22 + (r + 0.5) * (rh * 0.74 / 10.0))
            roi = gray[cy-4:cy+4, cx-4:cx+4]
            row_means.append(float(np.mean(roi)))
            
        min_r = int(np.argmin(row_means))
        min_val = row_means[min_r]
        avg_val = float(np.mean(row_means))
        
        # If the minimum row is at least 7 units darker than the column average and min_val < 215
        if (avg_val - min_val) >= 7.0 and min_val < 215:
            digits.append(str(min_r))
        else:
            digits.append('')
            
    clean = ''.join(digits)
    print(f"{img_path.split('/')[-1]} -> Detected Clean: '{clean}' (Raw: {digits})")
    return clean

detect_reg_exact('d:/memari_soft/omr_scans/1793235354659_ddd.jpg')
detect_reg_exact('d:/memari_soft/omr_scans/1793235354671_1_m0001.jpg')
detect_reg_exact('d:/memari_soft/omr_scans/1793235354682_1_m0002.jpg')
