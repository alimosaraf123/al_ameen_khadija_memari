import cv2
import numpy as np

img = cv2.imread('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg')
debug = img.copy()

# Answers block in sample_1:
# Let's inspect the 4 columns
# Col 1: Q1..10
# Col 2: Q11..20
# Col 3: Q21..30
# Col 4: Q31..40

cols_x = [
    [109, 137, 165, 193], # Q1-10
    [263, 291, 319, 347], # Q11-20
    [418, 446, 474, 502], # Q21-30
    [573, 601, 629, 657], # Q31-40
]

for col_idx, xs in enumerate(cols_x):
    for r in range(10):
        y = int(676 + r * 16.5)
        for x in xs:
            cv2.circle(debug, (x, y), 5, (0, 255, 0), 1)

# Registration box in sample_1:
# 10 columns of digits (0-9)
reg_xs = [int(80 + c * 15.3) for c in range(10)]
reg_ys = [int(277 + r * 16.2) for r in range(10)]

for x in reg_xs:
    for y in reg_ys:
        cv2.circle(debug, (x, y), 5, (0, 0, 255), 1)

cv2.imwrite('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/debug_annotated.jpg', debug)
print("Saved debug_annotated.jpg")
