import cv2
import numpy as np

img = cv2.imread('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg')
h, w = img.shape[:2]
print(f"Loaded image {w}x{h}")

# In sample_1, let's look at the Registration No block:
# It starts around y=210 to y=440, x=70 to x=240
# And the Answers block:
# Starts around y=630 to y=850, x=70 to x=680
# 4 columns:
# Col 1: Q1 to Q10
# Col 2: Q11 to Q20
# Col 3: Q21 to Q30
# Col 4: Q31 to Q40

# Let's save crops to verify exact areas
cv2.imwrite('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/crop_reg.jpg', img[210:450, 70:240])
cv2.imwrite('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/crop_answers.jpg', img[630:860, 60:690])
print("Crops saved successfully")
