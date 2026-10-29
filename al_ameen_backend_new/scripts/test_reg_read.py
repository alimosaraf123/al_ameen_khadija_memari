import cv2
import numpy as np

def read_registration_no(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Registration Box: 10 columns (digits 0 to 9)
    # Calibrated coordinates based on 724x1024 layout
    reg_xs = [int(80 + c * 15.35) for c in range(10)]
    reg_ys = [int(277 + r * 16.25) for r in range(10)]
    
    detected_digits = []
    
    for c_idx, x in enumerate(reg_xs):
        intensities = []
        for r_idx, y in enumerate(reg_ys):
            roi = gray[y-5:y+5, x-5:x+5]
            # Lower intensity = darker/filled
            intensities.append(float(np.mean(roi)))
        
        min_idx = int(np.argmin(intensities))
        min_val = intensities[min_idx]
        sorted_vals = sorted(intensities)
        
        # Check contrast: filled bubble is distinctly darker than the other 9
        if min_val < 165 and (sorted_vals[1] - min_val > 25):
            detected_digits.append(str(min_idx))
        else:
            detected_digits.append('')
            
    # Clean up registration number
    # If 10 continuous digits:
    full_str = ''.join([d if d != '' else '?' for d in detected_digits])
    clean_digits = ''.join(detected_digits)
    return clean_digits, full_str, detected_digits

for f in ['sample_1_49787.jpg', 'sample_2_2262117692.jpg', 'sample_3_2262118804.jpg']:
    img = cv2.imread('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/' + f)
    clean, full, raw = read_registration_no(img)
    print(f"{f} -> Detected: '{clean}' (Raw: {full})")

