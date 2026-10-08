const MONTHLY_FEES_URL =
  'https://alameenmission.net/fees_payment/fees_memari/';

const FEES_RECEIPT_URL =
  'https://alameenmission.net/fees_receipt/';


function cleanHtmlText(html) {

  return String(html || '')

    .replace(
      /<script[\s\S]*?<\/script>/gi,
      ' '
    )

    .replace(
      /<style[\s\S]*?<\/style>/gi,
      ' '
    )

    .replace(
      /<br\s*\/?>/gi,
      ' '
    )

    .replace(
      /<[^>]+>/g,
      ' '
    )

    .replace(
      /&nbsp;/gi,
      ' '
    )

    .replace(
      /&amp;/gi,
      '&'
    )

    .replace(
      /&#8377;/gi,
      '₹'
    )

    .replace(
      /&quot;/gi,
      '"'
    )

    .replace(
      /&#39;/gi,
      "'"
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim();

}


function normalizeFeesClass(value) {

  return String(value || '')

    .toLowerCase()

    .replace(
      /science/g,
      'sc'
    )

    .replace(
      /commerce/g,
      'com'
    )

    .replace(
      /humanities/g,
      'arts'
    )

    .replace(
      /[^a-z0-9]/g,
      ''
    );

}


function getFeesClassOptions(html) {

  const options = [];

  const regex =
    /<option\b[^>]*value=["']?([^"' >]+)["']?[^>]*>([\s\S]*?)<\/option>/gi;

  let match;


  while (
    (
      match =
        regex.exec(html)
    ) !== null
  ) {

    const value =
      String(
        match[1] || ''
      ).trim();


    const label =
      cleanHtmlText(
        match[2]
      );


    if (
      value &&
      label
    ) {

      options.push({
        value,
        label,
        normalized:
          normalizeFeesClass(
            label
          ),
      });

    }

  }


  return options;

}


function findFeesClassId(
  options,
  className,
  stream
) {

  const cls =
    String(
      className || ''
    ).trim();

  const str =
    String(
      stream || ''
    ).trim();


  const candidates = [];


  // If stream is present, try the combined class first.
  if (cls && str) {

    candidates.push(
      `${cls}-${str}`
    );

    candidates.push(
      `${cls} ${str}`
    );

    candidates.push(
      `${cls}${str}`
    );

  }


  if (cls) {

    candidates.push(
      cls
    );

  }


  const normalizedCandidates =
    candidates
      .map(
        normalizeFeesClass
      )
      .filter(Boolean);


  // Exact match first
  for (
    const candidate
    of normalizedCandidates
  ) {

    const exact =
      options.find(
        (option) =>
          option.normalized ===
          candidate
      );


    if (exact) {
      return exact;
    }

  }


  // Flexible match
  for (
    const candidate
    of normalizedCandidates
  ) {

    const flexible =
      options.find(
        (option) =>
          option.normalized
            .includes(candidate)
          ||
          candidate
            .includes(
              option.normalized
            )
      );


    if (flexible) {
      return flexible;
    }

  }


  return null;

}


// ========================================
// GUARDIAN:
// AUTO MONTHLY FEE DUE
// ========================================


function duesThroughMonth(rows, throughMonth) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(throughMonth)))throw new Error('Invalid dues cutoff month');
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return rows.filter(row=>{
    const match=String(row.month_year).match(/^([A-Za-z]+)-(\d{4})$/);
    const month=match?months.indexOf(match[1].slice(0,3).toLowerCase()):-1;
    if(month<0)throw new Error('Unrecognized fee month');
    return `${match[2]}-${String(month+1).padStart(2,'0')}`<=throughMonth;
  });
}
async function getMonthlyFeeDue(student, {throughMonth}={}) {
      const pageResponse =
        await fetch(
          MONTHLY_FEES_URL,
          {
            method: 'GET',

            headers: {
              'User-Agent':
                'Mozilla/5.0',
            },

            signal:
              AbortSignal.timeout(
                15000
              ),
          }
        );


      if (
        !pageResponse.ok
      ) {

        throw new Error(
          `Fees website returned ${pageResponse.status}`
        );

      }


      const pageHtml =
        await pageResponse.text();


      const classOptions =
        getFeesClassOptions(
          pageHtml
        );


      const feesClass =
        findFeesClassId(
          classOptions,
          student.class_name,
          student.stream
        );


      if (!feesClass) throw new Error('Fees website class could not be matched');


      // ==================================
      // STEP 2:
      // POST REG NO + CLASS ID
      // ==================================

      const formData =
        new URLSearchParams();


      formData.set(
        'regno',
        String(
          student.registration_no
        ).trim()
      );


      formData.set(
        'classid',
        String(
          feesClass.value
        )
      );


      // The screenshot search is receiving a blank value.
      formData.set(
        'search',
        ''
      );


      const feeResponse =
        await fetch(
          MONTHLY_FEES_URL,
          {

            method: 'POST',

            headers: {

              'Content-Type':
                'application/x-www-form-urlencoded',

              'User-Agent':
                'Mozilla/5.0',

              'Referer':
                MONTHLY_FEES_URL,

            },

            body:
              formData.toString(),

            signal:
              AbortSignal.timeout(
                15000
              ),

          }
        );


      if (!feeResponse.ok) {

        throw new Error(
          `Fees website returned ${feeResponse.status}`
        );

      }


      const responseHtml =
        await feeResponse.text();


      const text =
        cleanHtmlText(
          responseHtml
        );


      // ==================================
      // STUDENT NAME FROM WEBSITE
      // ==================================

      let websiteStudentName =
        null;


      const nameMatch =
        text.match(
          /Name:\s*([A-Za-z .'-]+?)(?=\s+Reg\s*No:|\s+Branch:|\s+Hostel\s*Fees:)/i
        );


      if (nameMatch) {

        websiteStudentName =
          String(
            nameMatch[1]
          ).trim();

      }


      // ==================================
      // MONTHLY DUES
      // Example:
      // Oct-2026 5890 (Student Hostel Fee)
      // ==================================

      let monthlyDues = [];


      const dueRegex =
        /([A-Za-z]{3,9}-\d{4})\s+([0-9,]+(?:\.\d+)?)\s*\(([^)]+)\)/gi;


      let dueMatch;


      while (
        (
          dueMatch =
            dueRegex.exec(text)
        ) !== null
      ) {

        monthlyDues.push({

          month_year:
            dueMatch[1],

          amount:
            Number(
              String(
                dueMatch[2]
              ).replace(
                /,/g,
                ''
              )
            ),

          description:
            String(
              dueMatch[3]
            ).trim(),

        });

      }


      // ==================================
      // TOTAL DUE
      // ==================================

      let totalDue = 0;


      const totalMatch =
        text.match(
          /Total\s+Dues\s*[:-]*\s*Rs\.?\s*([0-9,]+(?:\.\d+)?)/i
        );


      if (totalMatch) {

        totalDue =
          Number(
            String(
              totalMatch[1]
            ).replace(
              /,/g,
              ''
            )
          );

      }


      // Fallback:
      // Add monthly rows when the total cannot be parsed.
      if (
        !totalDue &&
        monthlyDues.length
      ) {

        totalDue =
          monthlyDues.reduce(
            (
              total,
              item
            ) =>
              total +
              Number(
                item.amount || 0
              ),
            0
          );

      }


      if(throughMonth){
        if(!monthlyDues.length&&totalDue>0)throw new Error('Month-wise fees are unavailable');
        monthlyDues=duesThroughMonth(monthlyDues,throughMonth);
        totalDue=monthlyDues.reduce((sum,row)=>sum+Number(row.amount||0),0);
      }
      // ==================================
      // RESPONSE TO APP
      // ==================================

      return ({

        success: true,

        student: {

          id:
            student.id,

          registration_no:
            student.registration_no,

          student_name:
            student.student_name,

          website_student_name:
            websiteStudentName,

          class_name:
            student.class_name,

          stream:
            student.stream,

          fees_class_id:
            feesClass.value,

          fees_class_name:
            feesClass.label,

        },

        monthly_dues:
          monthlyDues,

        total_due:
          totalDue,

        payment_url:
          MONTHLY_FEES_URL,

        receipt_url:
          FEES_RECEIPT_URL,

        checked_at:
          new Date()
            .toISOString(),

      });



}
module.exports={getMonthlyFeeDue,duesThroughMonth};
