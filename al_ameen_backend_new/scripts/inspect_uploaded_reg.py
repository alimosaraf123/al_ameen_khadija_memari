import cv2
import numpy as np

def inspect_registration(img_path):
    img = cv2.imread(img_path)
    std = cv2.resize(img, (724, 1024))
    gray = cv2.cvtColor(std, cv2.COLOR_BGR2GRAY)
    
    # Locate box
    import omr_engine as oe
    reg_box = oe.locate_registration_box(std)
    rx, ry, rw, rh = reg_box
    print(f"\n{img_path.split('/')[-1]} Box: x={rx}, y={ry}, w={rw}, h={rh}")
    
    for c in range(10):
        cx = rx + int((c + 0.5) * (rw / 10.0))
        row_means = []
        for r in range(10):
            cy = ry + int(rh * 0.22 + (r + 0.5) * (rh * 0.74 / 10.0))
            roi = gray[cy-4:cy+4, cx-4:cx+4]
            row_means.append(round(float(np.mean(roi)), 1))
        min_r = int(np.argmin(row_means))
        print(f"  Col {c+1}: min row={min_r} (val={row_means[min_r]}), all={row_means}")

inspect_registration('d:/memari_soft/omr_scans/1793235354682_1_m0002.jpg')
inspect_registration('d:/memari_soft/omr_scans/1793235354671_1_m0001.jpg')
