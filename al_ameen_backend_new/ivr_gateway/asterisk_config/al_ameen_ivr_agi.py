#!/usr/bin/env python3
"""
Al-Ameen Mission Hostel Calling System - Asterisk FastAGI Bridge
Communicates between Asterisk PBX and Node.js Backend API
"""

import sys
import json
import urllib.request
import urllib.error

BACKEND_URL = "http://localhost:3000/api/calling-booth"

def send_agi_command(cmd):
    sys.stdout.write(f"{cmd}\n")
    sys.stdout.flush()
    return sys.stdin.readline().strip()

def set_channel_var(name, value):
    send_agi_command(f'SET VARIABLE {name} "{value}"')

def api_post(endpoint, data):
    url = f"{BACKEND_URL}/{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"success": False, "message": str(e)}
    except Exception as e:
        return {"success": False, "message": str(e)}

def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(0)

    action = args[0]

    if action == "verify_student":
        reg_no = args[1] if len(args) > 1 else ""
        res = api_post("verify-student", {"reg_no": reg_no})
        if res.get("success"):
            set_channel_var("AGI_STATUS", "confirm_reg")
            set_channel_var("STUDENT_ID", res.get("student_id", ""))
            set_channel_var("STUDENT_NAME", res.get("student_name", ""))
            set_channel_var("STUDENT_CLASS", res.get("class_name", ""))
        else:
            set_channel_var("AGI_STATUS", "invalid_reg")

    elif action == "confirm_student":
        student_id = args[1] if len(args) > 1 else ""
        confirm_digit = args[2] if len(args) > 2 else "1"
        res = api_post("confirm-student", {"student_id": student_id, "confirm_digit": confirm_digit})
        if res.get("success") and res.get("allowed"):
            set_channel_var("AGI_STATUS", "select_relation")
            set_channel_var("REMAINING_SECONDS", str(res.get("remaining_seconds", 480)))
            set_channel_var("GUARDIAN_PROMPT_FILE", "ivr/guardian_options_menu")
        else:
            status = res.get("status", "not_scheduled")
            set_channel_var("AGI_STATUS", status)

    elif action == "connect_guardian":
        student_id = args[1] if len(args) > 1 else ""
        selected_digit = args[2] if len(args) > 2 else "1"
        res = api_post("connect-guardian", {"student_id": student_id, "selected_digit": selected_digit})
        if res.get("success"):
            target_mobile = res.get("target_mobile", "")
            max_seconds = res.get("max_allowed_seconds", 480)
            time_limit_ms = max_seconds * 1000

            set_channel_var("TARGET_MOBILE", target_mobile)
            set_channel_var("TIME_LIMIT_MS", str(time_limit_ms))
            set_channel_var("CALL_ID", str(res.get("call_id", "")))
            set_channel_var("TARGET_RELATION", res.get("target_relation", ""))
        else:
            set_channel_var("TARGET_MOBILE", "")

    elif action == "end_call":
        call_id = args[1] if len(args) > 1 else ""
        duration_seconds = args[2] if len(args) > 2 else "0"
        dial_status = args[3] if len(args) > 3 else "completed"
        api_post("end-call", {
            "call_id": call_id,
            "duration_seconds": duration_seconds,
            "status": "completed" if int(duration_seconds or 0) > 0 else dial_status
        })

if __name__ == "__main__":
    main()
