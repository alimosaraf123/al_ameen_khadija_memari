import cv2
import numpy as np

def read_column_answers(gray, box, start_q):
    bx, by, bw, bh = box
    results = {}
    
    # 10 questions in this column
    header_offset = bh * 0.15
    row_height = (bh - header_offset) / 10.0
    
    # 4 options A, B, C, D horizontally
    # typically from 0.30 to 0.92 of width
    opt_fractions = [0.33, 0.52, 0.72, 0.91]
    
    for r in range(10):
        q_num = start_q + r
        cy = int(by + header_offset + (r + 0.5) * row_height)
        
        scores = []
        for opt_idx, frac in enumerate(opt_fractions):
            cx = int(bx + frac * bw)
            roi = gray[cy-4:cy+4, cx-4:cx+4]
            mean_val = float(np.mean(roi))
            scores.append(mean_val)
            
        min_idx = int(np.argmin(scores))
        min_val = scores[min_idx]
        sorted_s = sorted(scores)
        
        # A filled bubble is darker (lower mean_val) and has a gap to the second darkest
        if min_val < 165 and (sorted_s[1] - min_val > 15):
            results[q_num] = ['A', 'B', 'C', 'D'][min_idx]
        elif min_val < 165 and sorted_s[1] < 165 and (sorted_s[2] - sorted_s[1] > 15):
            results[q_num] = 'DOUBLE'
        else:
            results[q_num] = 'BLANK'
            
    return results

def read_all_answers(img_path):
    import locate_columns as lc
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    boxes = lc.locate_answers_table(img)
    
    all_ans = {}
    for i, box in enumerate(boxes):
        col_ans = read_column_answers(gray, box, start_q=(i*10 + 1))
        all_ans.update(col_ans)
        
    filled = {q: a for q, a in all_ans.items() if a != 'BLANK'}
    print(f"\n{img_path.split('/')[-1]}: {len(filled)} questions answered out of 40")
    print("Answers:", filled)
    return all_ans

read_all_answers('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg')
read_all_answers('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_2_2262117692.jpg')
read_all_answers('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_3_2262118804.jpg')
