import cv2
import numpy as np

def test_clahe(img_path):
    img = cv2.imread(img_path)
    img = cv2.resize(img, (724, 1024))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    norm_gray = clahe.apply(gray)
    
    # Registration box
    rx, ry, rw, rh = 78, 202, 168, 227
    
    detected = []
    for c in range(10):
        cx = rx + int((c + 0.5) * (rw / 10.0))
        scores = []
        for r in range(10):
            cy = ry + int(rh * 0.21 + (r + 0.5) * (rh * 0.76 / 10.0))
            roi = norm_gray[max(0, cy-5):min(1024, cy+5), max(0, cx-5):min(724, cx+5)]
            scores.append(float(np.mean(roi)))
            
        min_r = int(np.argmin(scores))
        min_val = scores[min_r]
        sorted_s = sorted(scores)
        diff = sorted_s[1] - min_val
        
        # In normalized grayscale, filled bubble is lowest value
        if diff > 10 and min_val < 150:
            detected.append(str(min_r))
        else:
            detected.append('-')
            
    print(f"{img_path.split('/')[-1]} -> Detected: {''.join(detected)}")

test_clahe('d:/memari_soft/omr_scans/sample_1_49787.jpg')
test_clahe('d:/memari_soft/omr_scans/sample_2_2262117692.jpg')
test_clahe('d:/memari_soft/omr_scans/sample_3_2262118804.jpg')
