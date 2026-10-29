import cv2
import numpy as np

def extract_answers(img_path):
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 4 columns:
    # Q1..10: x around 60..215, y around 660..845
    # Q11..20: x around 215..370
    # Q21..30: x around 370..525
    # Q31..40: x around 525..680
    
    col_offsets = [
        (65, 215),
        (220, 370),
        (375, 525),
        (530, 680)
    ]
    
    answers = {}
    
    for col_idx, (x_start, x_end) in enumerate(col_offsets):
        w = x_end - x_start
        # 4 options (A, B, C, D) inside each column:
        # Options occupy approximately 35% to 92% of the column width
        opt_xs = [int(x_start + w * p) for p in [0.35, 0.53, 0.72, 0.90]]
        
        for r in range(10):
            q_num = col_idx * 10 + (r + 1)
            y = int(676 + r * 16.5)
            
            scores = []
            for opt_idx, x in enumerate(opt_xs):
                roi = gray[y-5:y+5, x-5:x+5]
                # Measure how dark it is (mean intensity)
                scores.append(float(np.mean(roi)))
                
            min_idx = int(np.argmin(scores))
            min_val = scores[min_idx]
            sorted_s = sorted(scores)
            
            # If the lowest is darker than 175 and is at least 20 darker than next
            if min_val < 170 and (sorted_s[1] - min_val > 18):
                ans = ['A', 'B', 'C', 'D'][min_idx]
            elif min_val < 170 and sorted_s[1] < 170 and (sorted_s[2] - sorted_s[1] > 20):
                ans = 'DOUBLE'
            else:
                ans = 'BLANK'
                
            answers[q_num] = ans
            
    filled = {q: a for q, a in answers.items() if a != 'BLANK'}
    print(f"{img_path.split('/')[-1]} Total Filled Questions: {len(filled)} / 40")
    print("Detected Answers:", filled)
    return answers

extract_answers('d:/memari_soft/al_ameen_backend_new/uploads/omr_samples/sample_1_49787.jpg')
