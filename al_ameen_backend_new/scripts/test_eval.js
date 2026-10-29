async function test() {
  const evalRes = await fetch('http://localhost:3000/api/omr/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_name: 'Class X Biology Annual Test',
      total_questions: 35,
      marks_per_correct: 1.0,
      negative_mark: 0.0,
      full_marks: 35.0
    })
  });
  const data = await evalRes.json();
  console.log('Evaluated total:', data.total_evaluated);
  if (data.results) {
    data.results.forEach(r => {
      console.log('Rank ' + r.rank + ': Reg=' + r.registration_no + ' (Mission ID: ' + r.mission_reg_no + ') Name=' + r.student_name + ' Class=' + r.class_name + ' Right=' + r.correct_count + ' Wrong=' + r.wrong_count + ' Score=' + r.final_score + ' School=' + (r.school_name || 'N/A'));
    });
  }
}
test();
