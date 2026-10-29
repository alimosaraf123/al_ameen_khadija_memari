import cv2
import os

p1 = 'd:/memari_soft/omr_scans/1793235354659_ddd.jpg'
p2 = 'd:/memari_soft/omr_scans/1793235354671_1_m0001.jpg'
p3 = 'd:/memari_soft/omr_scans/1793235354682_1_m0002.jpg'

for p in [p1, p2, p3]:
    img = cv2.imread(p)
    # Resize to standard 724x1024
    std_img = cv2.resize(img, (724, 1024))
    
    # Check registration box on std_img
    import test_box_reg as tbr
    cv2.imwrite('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/temp_std.jpg', std_img)
    print(f"\nEvaluating resized {os.path.basename(p)}:")
    tbr.extract_reg_from_box('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/temp_std.jpg')
