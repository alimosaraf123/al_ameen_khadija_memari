import cv2
import numpy as np

def analyze_sample(path, name):
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Check registration box
    # On 724x1024, the 1. REGISTRATION No. box is approximately:
    # y: ~270 to ~440 for the 10 rows (0-9)
    # x: ~72 to ~235 for the 10 columns
    # Let's verify by finding dark filled bubbles
    print(f"\n--- Analyzing {name} ---")
    
analyze_sample('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg', 'Sample 1 (49787)')
analyze_sample('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_2_2262117692.jpg', 'Sample 2 (2262117692)')
analyze_sample('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_3_2262118804.jpg', 'Sample 3 (2262118804)')
