import cv2
import numpy as np

def extract_reg_from_box(img_path):
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    # Registration box is on the left, y around 200-220, w around 150-185, h around 220-250
    candidates = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if 60 <= x <= 110 and 190 <= y <= 235 and 150 <= w <= 190 and 210 <= h <= 255:
            candidates.append((x, y, w, h))
            
    if not candidates:
        print(f"Could not find reg box for {img_path}")
        return
        
    candidates = sorted(candidates, key=lambda b: b[2]*b[3], reverse=True)
    rx, ry, rw, rh = candidates[0]
    # print(f"Found box for {img_path}: x={rx}, y={ry}, w={rw}, h={rh}")
    
    # Now find bubbles inside the box:
    # 10 columns, 10 rows (0 to 9)
    # y range inside box: from 0.23*rh to 0.95*rh
    # x range inside box: from 0.05*rw to 0.95*rw
    
    detected = []
    for c in range(10):
        cx = rx + int((c + 0.5) * (rw / 10.0))
        scores = []
        for r in range(10):
            cy = ry + int(rh * 0.23 + (r + 0.5) * (rh * 0.72 / 10.0))
            roi = gray[cy-4:cy+4, cx-4:cx+4]
            scores.append(float(np.mean(roi)))
            
        min_r = int(np.argmin(scores))
        min_val = scores[min_r]
        sorted_s = sorted(scores)
        
        # If the darkest bubble is significantly darker than median/runner up
        diff = sorted_s[1] - min_val
        if min_val < 160 and diff > 18:
            detected.append(str(min_r))
        else:
            detected.append(' ')
            
    print(f"{img_path.split('/')[-1]} -> Detected: '{''.join(detected).strip()}' (Cols: {detected})")

extract_reg_from_box('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg')
extract_reg_from_box('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_2_2262117692.jpg')
extract_reg_from_box('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_3_2262118804.jpg')
