import cv2
import numpy as np

def test_reg_deep(img_path):
    img = cv2.imread(img_path)
    img = cv2.resize(img, (724, 1024))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if 55 <= x <= 115 and 185 <= y <= 245 and 145 <= w <= 195 and 205 <= h <= 260:
            candidates.append((x, y, w, h))
            
    if not candidates:
        rx, ry, rw, rh = 78, 208, 165, 235
    else:
        candidates = sorted(candidates, key=lambda b: b[2]*b[3], reverse=True)
        rx, ry, rw, rh = candidates[0]
        
    print(f"\n{img_path.split('/')[-1]} Box: x={rx}, y={ry}, w={rw}, h={rh}")
    
    # Let's inspect each column's 10 rows
    detected = []
    for c in range(10):
        cx = rx + int((c + 0.5) * (rw / 10.0))
        scores = []
        for r in range(10):
            # The bubbles start after the digit write box (top ~21%) to bottom ~97%
            cy = ry + int(rh * 0.21 + (r + 0.5) * (rh * 0.76 / 10.0))
            roi = gray[max(0, cy-5):min(1024, cy+5), max(0, cx-5):min(724, cx+5)]
            # Count pixels darker than 135
            dark_ratio = np.mean(roi < 135)
            scores.append((float(dark_ratio), float(np.mean(roi))))
            
        # Sort by dark ratio descending, then mean intensity ascending
        scores_sorted = sorted(range(10), key=lambda r: (scores[r][0], -scores[r][1]), reverse=True)
        best_r = scores_sorted[0]
        runner_up = scores_sorted[1]
        
        best_dark, best_mean = scores[best_r]
        runner_dark, runner_mean = scores[runner_up]
        
        # If best has high dark ratio or significantly darker than runner up
        if best_dark > 0.35 or (best_mean < 165 and runner_mean - best_mean > 12):
            detected.append(str(best_r))
        else:
            detected.append('-')
            
    print("Detected Reg:", ''.join(detected))

test_reg_deep('d:/memari_soft/omr_scans/sample_1_49787.jpg')
test_reg_deep('d:/memari_soft/omr_scans/sample_2_2262117692.jpg')
test_reg_deep('d:/memari_soft/omr_scans/sample_3_2262118804.jpg')
