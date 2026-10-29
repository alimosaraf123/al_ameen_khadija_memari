import cv2
import numpy as np

def locate_answers_table(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    # We look for the 4 answer column boxes (Q1..10, Q11..20, Q21..30, Q31..40)
    # Each column box has w around 130..170 and h around 210..260 and y > 600
    col_boxes = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if 130 <= w <= 170 and 210 <= h <= 265 and y >= 610:
            # Check duplicate
            if not any(abs(x - bx) < 15 and abs(y - by) < 15 for bx, by, bw, bh in col_boxes):
                col_boxes.append((x, y, w, h))
                
    col_boxes = sorted(col_boxes, key=lambda b: b[0]) # sort left to right
    return col_boxes

for f in ['sample_1_49787.jpg', 'sample_2_2262117692.jpg', 'sample_3_2262118804.jpg']:
    img = cv2.imread('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/' + f)
    boxes = locate_answers_table(img)
    print(f"\n{f}: Found {len(boxes)} answer column boxes:")
    for i, b in enumerate(boxes):
        print(f"  Col {i+1}: x={b[0]}, y={b[1]}, w={b[2]}, h={b[3]}")
