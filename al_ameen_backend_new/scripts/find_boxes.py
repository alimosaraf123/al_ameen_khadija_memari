import cv2
import numpy as np

def find_main_boxes(img_path):
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        # Filter for large rectangular boxes (like Registration table or Answer table)
        if w > 120 and h > 150:
            boxes.append((x, y, w, h, w*h))
            
    boxes = sorted(boxes, key=lambda b: b[4], reverse=True)
    print(f"\n{img_path} top boxes:")
    for b in boxes[:6]:
        print(f"  x={b[0]}, y={b[1]}, w={b[2]}, h={b[3]}, area={b[4]}")

find_main_boxes('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg')
find_main_boxes('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_2_2262117692.jpg')
find_main_boxes('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_3_2262118804.jpg')
