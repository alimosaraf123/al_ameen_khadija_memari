import cv2
import numpy as np

img = cv2.imread('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg')
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
H, W = gray.shape

# Let's find answer columns:
# In sample_1 (724x1024):
# Looking at the answers area:
# Column 1 (Q1-10): x approx 70 to 220, y approx 660 to 850
# Column 2 (Q11-20): x approx 225 to 375, y approx 660 to 850
# Column 3 (Q21-30): x approx 380 to 530, y approx 660 to 850
# Column 4 (Q31-40): x approx 535 to 685, y approx 660 to 850

# In Column 1, Q1 to Q10:
# 10 rows from y=675 to y=840 (approx dy=16.5px per row)
# Q1: y ~ 675
# Q2: y ~ 692
# Q3: y ~ 708
# Q4: y ~ 725
# Q5: y ~ 741
# Q6: y ~ 758
# Q7: y ~ 774
# Q8: y ~ 791
# Q9: y ~ 807
# Q10: y ~ 824

# Let's test Q1..10 in Column 1:
# For Column 1:
# A is around x = 110, B ~ 138, C ~ 165, D ~ 193
# Let's verify by measuring pixel intensities on Sample 1
# In Sample 1:
# Q1: B is ticked with pen, but let's check which bubble is filled!
# In Sample 1 image:
# Q1: C has pen tick, but look closely at bubbles:
# Q3: B is filled with black pen!
# Q4: C is filled!
# Q6: B is filled!
# Q8: B is filled!
# Q10: A is filled!
# Let's check these specific questions to verify coordinates!

for q_idx in range(10):
    y_center = int(676 + q_idx * 16.5)
    row_vals = []
    for opt_idx, x_center in enumerate([112, 140, 168, 196]):
        roi = gray[y_center-6:y_center+6, x_center-6:x_center+6]
        dark = np.mean(roi)
        row_vals.append((['A','B','C','D'][opt_idx], round(float(dark), 1)))
    print(f"Q{q_idx+1} (y={y_center}):", row_vals)

