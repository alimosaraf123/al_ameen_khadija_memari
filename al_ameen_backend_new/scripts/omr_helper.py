import cv2
import numpy as np
import json

def get_filled_option(gray, bboxes, thresh=0.20):
    # bboxes: list of (x, y, w, h) for [A, B, C, D]
    scores = []
    for (x, y, w, h) in bboxes:
        roi = gray[y:y+h, x:x+w]
        # Otsu or binary threshold: dark pixels are < 100
        dark_pixels = np.sum(roi < 110)
        total_pixels = roi.size
        ratio = dark_pixels / total_pixels
        scores.append(ratio)
    
    max_idx = int(np.argmax(scores))
    max_val = scores[max_idx]
    
    # Check if filled
    sorted_scores = sorted(scores, reverse=True)
    if sorted_scores[0] > 0.25 and (sorted_scores[0] - sorted_scores[1] > 0.10):
        return ['A', 'B', 'C', 'D'][max_idx], max_val, scores
    elif sorted_scores[0] > 0.25 and sorted_scores[1] > 0.25:
        return 'DOUBLE', sorted_scores[0], scores
    return 'BLANK', sorted_scores[0], scores

print("Helper defined")
