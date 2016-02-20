#! /usr/bin/python3

import PAM
import sys

def check_password(username, password):
    pam_auth = PAM.pam()

    pam_auth.start("cinnamon-screensaver")
    pam_auth.set_item(PAM.PAM_USER, username)

    def _pam_conv(auth, query_list, user_data = None):
        resp = []
        for i in range(len(query_list)):
            query, qtype = query_list[i]
            if qtype == PAM.PAM_PROMPT_ECHO_ON:
                resp.append((username, 0))
            elif qtype == PAM.PAM_PROMPT_ECHO_OFF:
                resp.append((password, 0))
            else:
                return None
        return resp

    pam_auth.set_item(PAM.PAM_CONV, _pam_conv)
    
    try:
        pam_auth.authenticate()
        pam_auth.acct_mgmt()
    except PAM.error as res:
        return (False, res.args[0])
    except Exception as e:
        log.warn("Error with PAM: %s" % str(e))
        return (False, e)
    else:
        return (True, None)
