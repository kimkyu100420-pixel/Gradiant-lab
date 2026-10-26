"""경사하강법 시뮬레이터 (Streamlit)

공을 y = x² 곡선 위에서 굴려 보며 학습률(α)이 움직임에 어떤 영향을 주는지 발견하는 학습 게임.

- 디자인 토큰(CSS 변수)으로 색·간격·그림자를 한 곳에서 관리합니다.
- 모든 팝업/효과는 하늘색 계열의 밝은 카드로 통일했습니다.
- `.streamlit/config.toml`(함께 제공)을 두면 슬라이더 색까지 테마와 완전히 맞습니다.
"""

import html
import inspect
import itertools
import json
import math

import altair as alt
import numpy as np
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(
    page_title="경사하강법 시뮬레이터",
    page_icon="⚽",
    layout="wide",
    initial_sidebar_state="auto",
)

START_X = 8.0
SUCCESS_THRESHOLD = 1e-5
TARGET_XP = 10000
CLIP_LIMIT = 1e5

# 그래프 애니메이션 타이밍(ms). JS 애니메이션과 효과 지연 계산이 같은 값을 씁니다.
ANIM_START_HOLD = 350
ANIM_MOVE_MS = 480
ANIM_HOLD_MS = 200


def _dialog_kwargs():
    """닫기(X/ESC) 후에도 화면의 XP·진행도가 최신이 되도록, 지원하는 버전에서는 닫을 때 rerun."""
    try:
        if "on_dismiss" in inspect.signature(st.dialog).parameters:
            return {"on_dismiss": "rerun"}
    except (TypeError, ValueError):
        pass
    return {}


DIALOG_KW = _dialog_kwargs()


def compact(s):
    """HTML 조각을 한 줄로 압축. 마크다운은 HTML 블록 안의 빈 줄/들여쓰기를 코드 블록으로 오해하므로 이를 원천 차단."""
    return " ".join(line.strip() for line in s.strip().splitlines() if line.strip())


def embed_html(page, height):
    """HTML/JS 를 iframe 으로 삽입. 최신 Streamlit 은 st.iframe, 구버전은 components.html 사용."""
    if hasattr(st, "iframe"):
        st.iframe(page, height=max(1, int(height)))  # st.iframe 은 높이 0 을 허용하지 않음
    else:
        components.html(page, height=height, scrolling=False)

# --------------------------- Design system ---------------------------
APP_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@400;500;700;800&display=swap');

:root{
  /* palette: 하늘색(sky) + 시안(cyan) + 네이비 */
  --bg:#EFF5FB; --surface:#FFFFFF; --sky-50:#F2FAFE; --sky-100:#E5F6FD; --sky-200:#D3EEFA; --sky-300:#B5E0F0;
  --ink:#142B4A; --ink-2:#26374F; --muted:#586A82;
  --line:#D2DFEC; --line-strong:#B4C8DC;
  --cyan:#38D5E8; --cyan-ink:#0B6B84; --blue:#1769AA; --blue-2:#2946A0; --navy:#15345B;
  --ok:#1F7A4D; --ok-bg:#E6F7EE; --ok-line:#8FD1AB;
  --bad:#B3362B; --bad-bg:#FFF0ED; --bad-line:#F2A596;
  --warn:#80540A; --warn-bg:#FFF6DC; --warn-line:#EBC565;
  /* radius / elevation / motion */
  --r-sm:10px; --r-md:14px; --r-lg:20px;
  --sh-1:0 1px 2px rgba(20,43,74,.06),0 2px 8px rgba(20,43,74,.05);
  --sh-2:0 6px 20px rgba(20,43,74,.10);
  --sh-3:0 22px 56px rgba(20,43,74,.28);
  --ease:cubic-bezier(.2,.8,.2,1);
  --font-body:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;
  --font-display:'Jua','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;
}

/* ---------- base ---------- */
.stApp,[data-testid="stAppViewContainer"]{
  background:radial-gradient(1100px 480px at 88% -6%,rgba(56,213,232,.14),transparent 62%),var(--bg)!important;
  color:var(--ink-2);font-family:var(--font-body);word-break:keep-all;overflow-wrap:break-word;
}
[data-testid="stHeader"]{background:rgba(239,245,251,.82)!important;backdrop-filter:blur(8px)}
[data-testid="stMainBlockContainer"],.block-container{max-width:1240px!important;padding-top:4.6rem!important;padding-bottom:4rem!important}
h1,h2,h3{font-family:var(--font-display)!important;color:var(--ink)!important;letter-spacing:-.01em;font-weight:400!important}
[data-testid="stHeadingWithActionElements"] h2{font-size:1.7rem!important;line-height:1.25!important}
[data-testid="stHeadingWithActionElements"] h3{font-size:1.4rem!important;line-height:1.3!important}
[data-testid="stHeadingActionElements"]{display:none!important}
h1,h2,h3,h4,p,li,span,div,label{word-break:keep-all;overflow-wrap:break-word}
p,li{color:var(--ink-2)}
[data-testid="stCaptionContainer"],[data-testid="stCaptionContainer"] p{color:var(--muted)!important;line-height:1.55;opacity:1!important}
[data-testid="stWidgetLabel"] p,label p{color:var(--ink)!important;font-weight:700}
hr{border-color:var(--line)!important;margin:1.4rem 0!important}
:focus-visible{outline:3px solid var(--blue)!important;outline-offset:2px!important}

/* 스크립트 전용 iframe 을 담은 컨테이너: 화면에서 빼서 빈 간격이 생기지 않게 함(스크립트는 그대로 실행됨) */
[class*="st-key-gd_script_"]{position:absolute!important;width:0!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;visibility:hidden}

/* ---------- sidebar ---------- */
[data-testid="stSidebar"]{background:linear-gradient(180deg,#E6F0F9,#D8E6F3)!important;border-right:1px solid #BCD0E4}
[data-testid="stSidebar"] [data-testid="stSidebarHeader"]{padding-bottom:0}
[data-testid="stSidebar"] h2{font-size:1.35rem!important}
.start-chip{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px;box-shadow:var(--sh-1);margin:2px 0 6px}
.start-chip .sc-ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--sky-100);color:var(--blue);flex:none}
.start-chip .sc-k{font-size:.78rem;color:var(--muted);font-weight:500}
.start-chip .sc-v{font-size:1.15rem;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.start-chip .sc-v small{font-size:.8rem;color:var(--muted);font-weight:500;margin-left:4px}
[data-testid="stSliderThumbValue"]{color:var(--blue)!important;font-weight:800!important;font-variant-numeric:tabular-nums}
[data-testid="stSliderTickBar"],[data-testid="stSliderTickBar"] p{color:var(--muted)!important;font-size:.78rem!important}
[data-testid="stTextInput"] input{background:#fff!important;color:var(--ink)!important;border-radius:var(--r-sm)!important}
[data-testid="stTextInput"] [data-baseweb="input"],[data-testid="stTextInputRootElement"]{border-radius:var(--r-sm)!important;border:1.5px solid var(--line-strong)!important;background:#fff!important}
[data-testid="stTextInput"] [data-baseweb="input"]:focus-within,[data-testid="stTextInputRootElement"]:focus-within{border-color:var(--blue)!important;box-shadow:0 0 0 3px rgba(23,105,170,.18)}

/* ---------- buttons ---------- */
div[data-testid="stButton"] button,div[data-testid="stDownloadButton"] button{
  min-height:2.75rem;border-radius:12px;font-weight:700;letter-spacing:-.005em;cursor:pointer;
  background:#fff!important;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;
  border:1.5px solid #8FDCEA!important;box-shadow:0 1px 2px rgba(20,43,74,.05);
  transition:background-color .16s var(--ease),border-color .16s var(--ease),box-shadow .16s var(--ease),transform .12s var(--ease);
  touch-action:manipulation;
}
div[data-testid="stButton"] button *,div[data-testid="stDownloadButton"] button *{color:inherit!important;-webkit-text-fill-color:inherit!important}
div[data-testid="stButton"] button:hover,div[data-testid="stDownloadButton"] button:hover{background:var(--sky-100)!important;border-color:var(--cyan)!important;box-shadow:0 4px 14px rgba(24,188,211,.22)}
div[data-testid="stButton"] button:active,div[data-testid="stDownloadButton"] button:active{transform:scale(.98)}
div[data-testid="stButton"] button:disabled{opacity:.55;cursor:not-allowed}
div[data-testid="stButton"] button[kind="primary"]{
  background:linear-gradient(135deg,#1B78C2,#2946A0)!important;color:#fff!important;-webkit-text-fill-color:#fff!important;
  border:1px solid #164E83!important;box-shadow:0 6px 16px rgba(23,105,170,.28),0 0 0 0 rgba(56,213,232,0);
}
div[data-testid="stButton"] button[kind="primary"]:hover{background:linear-gradient(135deg,#2487D6,#3156B8)!important;border-color:#164E83!important;box-shadow:0 8px 22px rgba(23,105,170,.34),0 0 0 4px rgba(56,213,232,.28)}
.st-key-mode_toggle_on button{background:#E6F7EE!important;border-color:#8FD1AB!important;color:#14532D!important;-webkit-text-fill-color:#14532D!important}
.st-key-mode_toggle_on button:hover{background:#D7F1E3!important;border-color:#5DBB88!important;box-shadow:0 4px 14px rgba(31,122,77,.18)}

/* 상단 버튼 두 개는 모바일에서도 나란히 */
.st-key-topnav [data-testid="stHorizontalBlock"]{flex-wrap:nowrap!important;gap:12px!important}
.st-key-topnav [data-testid="stColumn"],.st-key-topnav [data-testid="column"]{min-width:0!important}
@media(max-width:560px){.st-key-topnav button{font-size:.86rem!important;padding-inline:.5rem!important}}

/* 모바일 전용 실행 버튼(사이드바가 접혀 있을 때) */
.st-key-mobile_run{display:none}
@media(max-width:768px){.st-key-mobile_run{display:block;margin:2px 0 6px}}

/* ---------- hero ---------- */
.hero{position:relative;overflow:hidden;border-radius:var(--r-lg);padding:clamp(20px,3.4vw,32px);margin-bottom:14px;color:#fff;
  background:linear-gradient(135deg,#15345B 0%,#1F4C80 55%,#2A6BA6 100%);box-shadow:var(--sh-2)}
.hero::before{content:"";position:absolute;right:-70px;top:-90px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(56,213,232,.40),transparent 68%);pointer-events:none}
.hero-art{position:absolute;right:clamp(10px,3vw,40px);bottom:-4px;width:min(300px,36%);height:auto;pointer-events:none}
.hero h1{position:relative;margin:0!important;padding:0!important;color:#fff!important;font-size:clamp(1.75rem,3.6vw,2.55rem)!important;line-height:1.15!important}
.hero p{position:relative;margin:.55rem 0 0!important;color:#DDF1FB!important;font-size:clamp(.95rem,1.5vw,1.08rem);line-height:1.55;max-width:34em}
.hero-steps{position:relative;display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0!important;padding:0!important;padding-inline-start:0!important;margin-inline-start:0!important;list-style:none!important}
.hero-steps li{margin:0!important}
.hero-steps li{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);color:#fff!important;font-size:.9rem;font-weight:500}
.hero-steps li b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#fff;color:var(--navy);font-size:.78rem;font-weight:800}
@media(max-width:700px){.hero-art{display:none}}

/* ---------- 공통 카드 / 진행바 / 통계 ---------- */
.xp-bar{height:12px;border-radius:999px;background:var(--sky-200);overflow:hidden;box-shadow:inset 0 1px 2px rgba(20,43,74,.10)}
.xp-bar>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--cyan),var(--blue));transition:width .6s var(--ease)}
.stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.stat{display:flex;align-items:center;gap:10px;background:var(--sky-50);border:1px solid #CBE8F5;border-radius:12px;padding:10px 12px;min-width:0}
.stat .st-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#fff;color:var(--blue);flex:none;box-shadow:var(--sh-1)}
.stat .st-k{font-size:.78rem;color:var(--muted);font-weight:500}
.stat .st-v{font-size:1.15rem;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
@media(max-width:560px){.stat{flex-direction:column;align-items:flex-start;gap:4px}.stat .st-ic{display:none}.stat .st-v{font-size:1.05rem}}

.hud{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-1);padding:16px 18px 18px;margin:12px 0 18px}
.hud-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px 16px;flex-wrap:wrap;margin-bottom:10px}
.hud-title{font-family:var(--font-display);font-size:1.2rem;color:var(--ink)}
.hud-xp{color:var(--muted);font-weight:700;font-variant-numeric:tabular-nums}
.hud-xp b{color:var(--blue);font-size:1.3rem;font-weight:800}
.hud .xp-bar{margin-bottom:14px}

/* ---------- callout (알림) ---------- */
.callout{display:flex;gap:12px;align-items:flex-start;border-radius:var(--r-md);padding:12px 14px;border:1px solid;line-height:1.5}
.callout .co-ic{flex:none;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:#fff}
.callout .co-t{font-weight:800}
.callout .co-s{font-weight:500;font-size:.92rem;opacity:.95}
.callout-ok{background:var(--ok-bg);border-color:var(--ok-line);color:#14532D}.callout-ok .co-ic{color:var(--ok)}
.callout-bad{background:var(--bad-bg);border-color:var(--bad-line);color:#7A1F17}.callout-bad .co-ic{color:var(--bad)}
.callout-warn{background:var(--warn-bg);border-color:var(--warn-line);color:#5E3C00}.callout-warn .co-ic{color:var(--warn)}
.callout-info{background:var(--sky-100);border-color:var(--sky-300);color:#0F3B5C}.callout-info .co-ic{color:var(--blue)}

/* ---------- 결과 패널 ---------- */
.res-score{background:linear-gradient(135deg,#fff,var(--sky-100));border:1px solid var(--line);border-radius:var(--r-md);padding:16px 18px;box-shadow:var(--sh-1);margin-top:12px}
.res-score .lbl{font-size:.85rem;color:var(--muted);font-weight:700}
.res-score .val{font-size:2.7rem;line-height:1.1;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.res-score .val small{font-size:1.05rem;color:var(--muted);font-weight:700;margin-left:4px}
.res-score .xp-bar{height:8px;margin-top:8px}
.res-rows{margin-top:12px;background:#fff;border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-1);overflow:hidden}
.res-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 16px;border-top:1px solid #E6EEF6}
.res-row:first-child{border-top:0}
.res-row .k{color:var(--muted);font-weight:500;flex:none}
.res-row .v{font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;text-align:right}
.res-row .k small{display:block;font-size:.75rem;color:var(--muted);font-weight:400}
.res-note{margin:10px 2px 0;color:var(--muted);font-size:.85rem;line-height:1.5}

/* ---------- 마스터 배너 ---------- */
.master-banner{position:relative;overflow:hidden;text-align:center;padding:clamp(22px,4.5vw,40px);margin:12px 0 18px;border-radius:var(--r-lg);border:1px solid #BFE3F0;background:linear-gradient(135deg,#FFFFFF,var(--sky-100));box-shadow:var(--sh-2)}
.master-banner .mb-badge{display:inline-grid;place-items:center;width:clamp(72px,11vw,100px);height:clamp(72px,11vw,100px);border-radius:50%;background:linear-gradient(145deg,#DFF3FC,#fff);border:1px solid #B7DCEB;font-size:clamp(38px,6vw,56px);box-shadow:inset 0 2px 10px #fff,0 8px 18px rgba(20,43,74,.12);margin-bottom:10px}
.master-banner h2{font-size:clamp(1.8rem,5vw,3rem)!important;line-height:1.15;margin:0!important;color:var(--ink)!important}
.master-banner p{font-size:clamp(.95rem,2vw,1.15rem);font-weight:500;color:var(--muted)!important;margin:10px 0 0}
.master-banner .mb-chip{margin-top:16px;display:inline-block;background:var(--ok-bg);color:#14532D;padding:8px 16px;border-radius:999px;font-weight:800;border:1px solid var(--ok-line)}

/* ---------- 팝업(st.dialog) : 밝은 하늘빛 카드 ---------- */
[data-testid="stDialog"]{background:rgba(21,52,91,.46)!important;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
/* 보이는 팝업 상자 = stDialog 의 첫 번째 자식. 크기·배경·모서리는 여기에 적용 */
[data-testid="stDialog"]>div{
  width:min(94vw,820px)!important;max-width:820px!important;margin-left:auto!important;margin-right:auto!important;
  background:linear-gradient(180deg,#F5FBFE 0,#FFFFFF 140px)!important;color:var(--ink-2)!important;
  border:1px solid #BFDDEC!important;border-radius:24px!important;box-shadow:var(--sh-3)!important;
}
[data-testid="stDialog"] [role="dialog"]{background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;width:100%!important;max-width:none!important;color:var(--ink-2)!important}
[data-testid="stDialog"] [role="dialog"] h1,[data-testid="stDialog"] [role="dialog"] h2,[data-testid="stDialog"] [role="dialog"] h3{color:var(--ink)!important}
[data-testid="stDialog"] [role="dialog"] h2{font-size:1.5rem!important}
[data-testid="stDialog"] [data-testid="stMarkdownContainer"] p,[data-testid="stDialog"] label{color:var(--ink-2)}
[data-testid="stDialog"] button[aria-label="Close"],[data-testid="stDialog"] button[aria-label="닫기"]{color:var(--ink)!important}
/* 퀘스트 카드 = '.quest-head 를 직접 품은' 테두리 컨테이너 (최신: stVerticalBlock / 구버전: stVerticalBlockBorderWrapper) */
[data-testid="stDialog"] :is([data-testid="stVerticalBlock"]:has(> .element-container .quest-head),[data-testid="stVerticalBlockBorderWrapper"]:has(> [data-testid="stVerticalBlock"] > .element-container .quest-head)){
  border:1px solid var(--line)!important;border-radius:16px!important;background:#fff!important;box-shadow:var(--sh-1);
  transition:box-shadow .2s var(--ease),border-color .2s var(--ease);
}
[data-testid="stDialog"] :is([data-testid="stVerticalBlock"]:has(> .element-container .quest-head),[data-testid="stVerticalBlockBorderWrapper"]:has(> [data-testid="stVerticalBlock"] > .element-container .quest-head)):has(.q-ready){
  border-color:#6CCFE2!important;background:linear-gradient(180deg,#F2FBFE,#fff)!important;box-shadow:0 0 0 3px rgba(56,213,232,.22),var(--sh-1);
}
[data-testid="stDialog"] :is([data-testid="stVerticalBlock"]:has(> .element-container .quest-head),[data-testid="stVerticalBlockBorderWrapper"]:has(> [data-testid="stVerticalBlock"] > .element-container .quest-head)):has(.q-claimed){
  background:#F3FBF6!important;border-color:#A8DCBD!important;
}
[data-testid="stDialog"] :is([data-testid="stVerticalBlock"]:has(> .element-container .quest-head),[data-testid="stVerticalBlockBorderWrapper"]:has(> [data-testid="stVerticalBlock"] > .element-container .quest-head)):has(.q-locked){
  background:#F6F9FC!important;border-style:dashed!important;border-color:#C3D2E2!important;
}

.panel-heading{background:linear-gradient(135deg,var(--sky-100),var(--sky-200));border:1px solid var(--sky-300);border-radius:var(--r-md);padding:16px 18px;margin-bottom:14px}
.panel-heading .ph-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px 14px;flex-wrap:wrap;margin-bottom:10px}
.panel-heading .ph-kicker{font-weight:800;font-size:.78rem;letter-spacing:.09em;color:var(--cyan-ink)}
.panel-heading .ph-xp{color:var(--muted);font-weight:700;font-variant-numeric:tabular-nums}
.panel-heading .ph-xp b{color:var(--blue);font-size:1.3rem;font-weight:800}
.panel-heading .xp-bar{background:#fff;margin-bottom:10px}
.panel-heading .ph-sub{margin:0!important;font-size:.92rem;color:var(--ink-2)!important}

.quest-head{display:flex;gap:12px;align-items:flex-start}
.quest-badge{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;border:1px solid}
.q-locked .quest-badge{background:#EEF2F7;border-color:#CBD5E1;color:#64748B}
.q-ready .quest-badge{background:var(--sky-100);border-color:#6CCFE2;color:var(--blue)}
.q-claimed .quest-badge{background:var(--ok-bg);border-color:var(--ok-line);color:var(--ok)}
.quest-main{flex:1 1 0;min-width:0}
.quest-title{font-weight:800;color:var(--ink);font-size:1.05rem}
.quest-desc{color:var(--muted);font-size:.93rem;margin-top:2px;line-height:1.5}
.xp-chip{flex:none;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #BFE3F0;color:var(--cyan-ink);font-weight:800;font-size:.85rem;font-variant-numeric:tabular-nums}
.quest-state{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:5px 12px;border-radius:999px;font-weight:700;font-size:.88rem}
.quest-state.is-claimed{background:var(--ok-bg);color:#14532D;border:1px solid var(--ok-line)}
.quest-state.is-locked{background:#EEF2F7;color:#475569;border:1px solid #D5DEE9}
.answer-n{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--sky-100);color:var(--blue);font-weight:800;border:1px solid var(--sky-300)}

.brief{display:grid;gap:12px;margin:4px 0 14px}
.brief-card{display:flex;gap:14px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:var(--r-md);padding:14px 16px;box-shadow:var(--sh-1)}
.brief-card .bc-n{flex:none;width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#1B78C2,#2946A0);color:#fff;font-weight:800}
.brief-card .bc-t{font-family:var(--font-display);font-size:1.15rem;color:var(--ink);line-height:1.35}
.brief-card .bc-s{margin-top:4px;color:var(--muted);line-height:1.55}
.brief-emoji{text-align:center;font-size:clamp(40px,8vw,64px);line-height:1.2;margin:2px 0 6px}

.master-dialog{text-align:center;padding:6px 4px 14px}
.master-dialog .md-emoji{font-size:clamp(54px,10vw,86px);line-height:1.15}
.master-dialog .md-title{font-family:var(--font-display);font-size:clamp(1.5rem,4.2vw,2.1rem);color:var(--ink);margin:8px 0}
.master-dialog p{color:var(--muted)!important;font-size:1.02rem;line-height:1.6;margin:0 0 14px!important}
.master-dialog .md-chip{display:inline-block;background:var(--ok-bg);color:#14532D;padding:9px 16px;border-radius:999px;font-weight:800;border:1px solid var(--ok-line)}

/* ---------- 전체화면 실험 효과 : 검은 배경 대신 하늘빛 스크림 + 밝은 카드 ---------- */
@keyframes gdOverlay{0%{opacity:0}9%,82%{opacity:1}100%{opacity:0}}
@keyframes gdCardIn{0%{opacity:0;transform:translateY(18px) scale(.94)}14%{opacity:1;transform:translateY(0) scale(1.015)}24%,100%{opacity:1;transform:none}}
@keyframes gdShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@keyframes gdParticle{0%{opacity:0;transform:translate(-50%,-50%) scale(.3) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1.15) rotate(300deg)}}
@keyframes gdRing{0%{opacity:.6;transform:translate(-50%,-50%) scale(.2)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.9)}}
.gd-overlay{--tint:56,213,232;--accent-ink:#07667A;
  position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;
  background:radial-gradient(ellipse at 50% 42%,rgba(var(--tint),.32),rgba(21,52,91,.56) 72%);
  -webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);animation:gdOverlay 3s ease-in-out both}
.gd-overlay.is-waiting{visibility:hidden;pointer-events:none;animation:none;opacity:0}
.gd-overlay.is-closing{animation:none;opacity:0;transition:opacity .18s ease}
.gd-overlay::before{content:"";position:absolute;left:50%;top:46%;width:min(120vw,120vh);height:min(120vw,120vh);border-radius:50%;border:3px solid rgba(var(--tint),.6);pointer-events:none;animation:gdRing 1.5s ease-out .1s both}
.gd-failure{--tint:255,125,94;--accent-ink:#B03418}
.gd-success{--tint:56,213,232;--accent-ink:#07667A}
.gd-turtle{--tint:80,208,150;--accent-ink:#126E4A}
.gd-card{position:relative;z-index:2;width:min(90vw,640px);max-height:84vh;overflow:auto;padding:clamp(24px,4vw,40px);text-align:center;
  background:linear-gradient(165deg,#FFFFFF 0%,#F1F9FE 100%);border:2px solid rgba(var(--tint),.95);border-radius:26px;
  box-shadow:0 26px 70px rgba(21,52,91,.38),0 0 0 8px rgba(var(--tint),.16);animation:gdCardIn .6s var(--ease) both}
.gd-failure .gd-card{animation:gdCardIn .6s var(--ease) both,gdShake .09s linear .5s 4}
.gd-kicker{display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(var(--tint),.18);color:var(--accent-ink);font-weight:800;font-size:clamp(12px,1.8vw,14px);letter-spacing:.08em}
.gd-emoji{font-size:clamp(40px,9vw,90px);line-height:1.15;margin:10px 0 4px}
.gd-head{font-family:var(--font-display);font-size:clamp(22px,3.6vw,32px);line-height:1.3;color:var(--ink);margin:8px 0}
.gd-copy{font-size:clamp(15px,2vw,18px);line-height:1.65;color:#40536B}
.gd-meta{display:inline-block;margin-top:14px;padding:6px 14px;border-radius:999px;background:rgba(var(--tint),.16);color:var(--accent-ink);font-weight:800;font-size:.95rem}
.gd-particle{position:absolute;left:50%;top:46%;z-index:1;pointer-events:none;font-size:clamp(28px,4.4vw,52px);animation:gdParticle 2.2s cubic-bezier(.15,.65,.2,1) both;animation-delay:var(--d,0s)}
.gd-close{position:absolute;top:10px;right:10px;width:44px;height:44px;border:0;border-radius:50%;display:grid;place-items:center;background:rgba(21,52,91,.07);color:var(--ink);cursor:pointer}
.gd-close:hover{background:rgba(21,52,91,.14)}
.gd-hint{position:absolute;z-index:2;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);max-width:90vw;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.94);color:var(--ink);font-weight:700;font-size:14px;box-shadow:var(--sh-2);text-align:center}
@media (hover:none){.gd-hint-k{display:none}}
@media (prefers-reduced-motion:reduce){
  .gd-card,.gd-failure .gd-card{animation:none!important}
  .gd-particle,.gd-overlay::before{display:none!important}
}
"""

st.markdown("<style>" + APP_CSS + "</style>", unsafe_allow_html=True)

# 슬라이더 색: config.toml 의 테마 primaryColor 가 없으면(기본 빨강) 하늘/파랑 계열로 보정
if not st.get_option("theme.primaryColor"):
    st.markdown(
        compact("""<style>
        [data-testid="stSlider"] [data-orientation="horizontal"]>div:first-child:empty{filter:hue-rotate(205deg) saturate(.85)}
        [data-testid="stSlider"] [data-orientation="horizontal"]>div[style*="position: absolute"]{background-color:var(--blue)!important}
        </style>"""),
        unsafe_allow_html=True,
    )

# --------------------------- SVG icons (Lucide 스타일, 선 두께 통일) ---------------------------
_ICON_PATHS = {
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "trophy": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    "gift": '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    "zap": '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    "repeat": '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    "activity": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "flask": '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
    "unlock": '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
}


def icon(name, size=18):
    return (
        f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
        f"{_ICON_PATHS[name]}</svg>"
    )


def callout(kind, title, sub=None, icon_name="info"):
    sub_html = f'<div class="co-s">{sub}</div>' if sub else ""
    return (
        f'<div class="callout callout-{kind}" role="status"><span class="co-ic">{icon(icon_name)}</span>'
        f'<div><div class="co-t">{title}</div>{sub_html}</div></div>'
    )


def fmt_num(v):
    """결과 숫자를 읽기 쉽게: 정수는 천 단위 구분, 나머지는 유효숫자 6자리."""
    v = float(v)
    if not np.isfinite(v):
        return "∞"
    if v == 0:
        return "0"
    if abs(v) < 1e12 and float(v).is_integer():
        return f"{int(v):,}"
    return f"{v:.6g}"


# --------------------------- Hero ---------------------------
st.markdown(
    compact("""
    <section class="hero">
      <svg class="hero-art" viewBox="0 0 320 150" aria-hidden="true" focusable="false">
        <path d="M20 8 Q160 290 300 8" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/>
        <path d="M48 59 L90 114 L126 141 L149 148" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-dasharray="4 5" stroke-linecap="round"/>
        <circle cx="48" cy="59" r="8" fill="#fff"/><circle cx="90" cy="114" r="6.5" fill="rgba(255,255,255,.85)"/>
        <circle cx="126" cy="141" r="5" fill="rgba(255,255,255,.7)"/><circle cx="149" cy="148" r="3.6" fill="rgba(255,255,255,.55)"/>
        <circle cx="161" cy="146" r="8" fill="#38D5E8"/>
      </svg>
      <h1>⚽ 경사하강법 시뮬레이터</h1>
      <p>직접 실험해 규칙을 발견하고, 퀘스트를 깨며 연구 도감을 완성하세요.</p>
      <ol class="hero-steps">
        <li><b>1</b>학습률 α 고르기</li>
        <li><b>2</b>실험 실행</li>
        <li><b>3</b>규칙 발견 · 퀘스트 클리어</li>
      </ol>
    </section>
    """),
    unsafe_allow_html=True,
)

# --------------------------- Session State ---------------------------
defaults = {
    "personal_records": [],
    "last_result": None,
    "attempt_id": 0,
    "effect_shown_for_attempt": -1,
    "quests_done": [],
    "quests_claimed": [],
    "rules_claimed": [],
    "quest_firework": False,
    "master_popup_pending": False,
    "master_popup_shown": False,
    "unlocked_rules": [],
    "xp": 0,
    "quest_notice": None,
    "quests_visible": False,
    "researcher_mode": False,
    "intro_popup_shown": False,
}
for key, value in defaults.items():
    if key not in st.session_state:
        st.session_state[key] = value

# 예전 버전(연구 규칙 보상) 세션 호환: 보상은 퀘스트 XP만 인정
st.session_state.rules_claimed = []

# 연구소 마스터: 모든 퀘스트를 완료하고 보상까지 수령했을 때
REQUIRED_QUEST_IDS = ["first_success", "slow", "one_step", "zigzag", "pingpong", "diverge"]
is_research_lab_master = (
    all(qid in st.session_state.quests_done for qid in REQUIRED_QUEST_IDS)
    and all(qid in st.session_state.quests_claimed for qid in REQUIRED_QUEST_IDS)
)
if is_research_lab_master:
    st.markdown(
        compact(f"""
        <section class="master-banner">
          <div class="mb-badge" aria-hidden="true">🏆</div>
          <h2>경사하강법 마스터</h2>
          <p>여섯 개의 퀘스트를 모두 완료하고, 움직임 연구를 마쳤습니다.</p>
          <div class="mb-chip">ALL QUESTS COMPLETE · {TARGET_XP:,} XP</div>
        </section>
        """),
        unsafe_allow_html=True,
    )

# --------------------------- Researcher mode + navigation ---------------------------
with st.container(key="topnav"):
    nav_mode, nav_quests = st.columns(2)
    with nav_mode:
        if st.session_state.researcher_mode:
            clicked_mode = st.button("🧑‍🔬 연구자 모드 ON", key="mode_toggle_on", width="stretch")
        else:
            clicked_mode = st.button("🔬 연구자 모드 OFF", key="mode_toggle_off", width="stretch")
        if clicked_mode:
            st.session_state.researcher_mode = not st.session_state.researcher_mode
            st.rerun()
    with nav_quests:
        if st.button("🧪 퀘스트", key="top_toggle_quests", type="primary", width="stretch"):
            st.session_state.quests_visible = True
            st.rerun()


# --------------------------- Game Math ---------------------------
def run_gradient_descent(x0, alpha, epochs):
    x = float(x0)
    xs, ys = [x], [x * x]
    overflow = False
    steps = 0
    if abs(x) < SUCCESS_THRESHOLD:
        return np.array(xs), np.array(ys), overflow, steps

    for _ in range(int(epochs)):
        x_next = x - float(alpha) * (2.0 * x)
        if not np.isfinite(x_next) or abs(x_next) > CLIP_LIMIT:
            overflow = True
            if np.isfinite(x_next):
                direction = 1.0 if x_next >= 0 else -1.0
            else:
                direction = (1.0 if x >= 0 else -1.0) * (-1.0 if alpha > 1 else 1.0)
            x_next = direction * CLIP_LIMIT
            xs.append(float(x_next))
            ys.append(float(CLIP_LIMIT ** 2))
            steps += 1
            break
        x = float(x_next)
        xs.append(x)
        ys.append(x * x)
        steps += 1
        if abs(x) < SUCCESS_THRESHOLD:
            break
    return np.array(xs), np.array(ys), overflow, steps


def classify_result(alpha, final_x, overflow):
    if overflow or not np.isfinite(final_x) or alpha > 1.0:
        return "우주폭발", "explode"
    if np.isclose(alpha, 1.0, atol=1e-8):
        return "무한 핑퐁", "pingpong"
    if abs(final_x) < SUCCESS_THRESHOLD:
        return "착륙 성공", "success"
    if alpha > 0.5:
        return "지그재그 수렴 중", "oscillating"
    return "아직 착륙 중", "landing"


def calc_score(final_x, status_code):
    if status_code == "success":
        return 100
    if not np.isfinite(final_x):
        return 0
    return max(0, min(99, int(99 * math.exp(-abs(final_x) / 2.0))))


def get_experiment_notification():
    """전체화면 효과가 닫힌 뒤 왼쪽 위에 잠깐 보여 주는 알림 문구."""
    notices = st.session_state.get("quest_notice", []) or []
    done = [n for n in notices if "퀘스트 완료" in n]
    if done:
        if len(done) > 1:
            return f"퀘스트 {len(done)}개 완료! 퀘스트 센터에서 보상을 수령하세요."
        return "퀘스트 완료! 퀘스트 센터에서 보상을 수령하세요."
    if notices:
        return "연구 기록이 저장되었습니다."
    return "기록되었습니다."


# --------------------------- 공용 JS (알림 토스트 / 불꽃놀이) ---------------------------
# JS 는 f-string 이 아닌 일반 문자열 + __토큰__ 치환으로 만들어, 중괄호 이스케이프 실수를 막습니다.
TOAST_JS = r"""
function gdToast(doc, text, kind) {
  try {
    if (!doc) return;
    if (!doc.getElementById('gd-toast-style')) {
      const st = doc.createElement('style'); st.id = 'gd-toast-style';
      st.textContent = '#gd-toast{position:fixed;top:18px;left:18px;z-index:2147483647;display:flex;align-items:center;gap:12px;max-width:min(440px,calc(100vw - 36px));box-sizing:border-box;padding:12px 10px 12px 14px;background:#fff;color:#142B4A;border:1px solid #CFE0EE;border-left:5px solid #38D5E8;border-radius:14px;box-shadow:0 10px 30px rgba(20,43,74,.18);font:600 15px/1.45 "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;opacity:0;transform:translateY(-8px);transition:opacity .2s ease,transform .2s ease}'
        + '#gd-toast.show{opacity:1;transform:none}'
        + '#gd-toast .gd-toast-ic{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#E4F8FC;color:#0B7A8F}'
        + '#gd-toast .gd-toast-x{flex:none;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:#586A82;cursor:pointer;display:grid;place-items:center}'
        + '#gd-toast .gd-toast-x:hover{background:#EEF4FA}'
        + '@media (prefers-reduced-motion:reduce){#gd-toast{transition:none}}';
      doc.head.appendChild(st);
    }
    const old = doc.getElementById('gd-toast'); if (old) old.remove();
    const svg = function (p) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
    const ic = kind === 'gift'
      ? svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>')
      : svg('<path d="M20 6 9 17l-5-5"/>');
    const t = doc.createElement('div');
    t.id = 'gd-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    t.innerHTML = '<span class="gd-toast-ic">' + ic + '</span><span class="gd-toast-msg"></span><button type="button" class="gd-toast-x" aria-label="알림 닫기">' + svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>') + '</button>';
    t.querySelector('.gd-toast-msg').textContent = text;
    t.querySelector('.gd-toast-x').addEventListener('click', function () { t.remove(); });
    doc.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 240); }, 5200);
  } catch (e) {}
}
"""

FIREWORKS_JS = r"""
function gdFireworks(win, opts) {
  try {
    opts = opts || {};
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const doc = win.document;
    const old = doc.getElementById('gd-fireworks'); if (old) old.remove();
    const root = doc.createElement('div');
    root.id = 'gd-fireworks'; root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483100;pointer-events:none;overflow:hidden;background:transparent';
    const canvas = doc.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    root.appendChild(canvas);
    if (opts.label) {
      const l = doc.createElement('div');
      l.textContent = opts.label;
      l.style.cssText = 'position:absolute;left:50%;bottom:11%;transform:translateX(-50%);padding:10px 22px;border-radius:999px;background:rgba(255,255,255,.96);color:#142B4A;border:2px solid #38D5E8;box-shadow:0 10px 30px rgba(20,43,74,.22);font:800 clamp(16px,2.6vw,24px)/1.3 "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;white-space:nowrap;max-width:92vw';
      root.appendChild(l);
    }
    doc.body.appendChild(root);
    const ctx = canvas.getContext('2d');
    const dpr = win.devicePixelRatio || 1;
    const big = !!opts.big;
    const maxFrames = big ? 270 : 150;
    let w = 0, h = 0, frame = 0;
    function resize() {
      w = win.innerWidth; h = win.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const colors = ['#38D5E8', '#1769AA', '#F4B400', '#FF7DA8', '#6FD3A0', '#9B8CFF', '#FF8A5C'];
    const rockets = [], sparks = [];
    function launch() {
      const side = Math.random() < .58;
      rockets.push({
        x: side ? (Math.random() < .5 ? -8 : w + 8) : w * Math.random(),
        y: side ? h * (.55 + Math.random() * .35) : h + 8,
        tx: w * (.08 + Math.random() * .84), ty: h * (.10 + Math.random() * .50),
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    function burst(r) {
      const n = (big ? 95 : 60) + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 2 * i / n, s = 1.2 + Math.random() * (big ? 5.3 : 4.2);
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 42 + Math.random() * 42, color: r.color, size: 1.5 + Math.random() * 2.6 });
      }
    }
    function draw() {
      if (!root.isConnected) return;
      ctx.clearRect(0, 0, w, h);
      if (big) { if (frame % 4 === 0) { launch(); launch(); } if (frame % 17 === 0) launch(); }
      else if (frame % 14 === 0) { launch(); launch(); }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i], dx = r.tx - r.x, dy = r.ty - r.y;
        if (Math.hypot(dx, dy) < 10) { burst(r); rockets.splice(i, 1); continue; }
        r.x += dx * .075; r.y += dy * .075;
        ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx; p.y += p.vy; p.vy += .034; p.vx *= .992; p.life--;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life / 17); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; frame++;
      if (frame < maxFrames) win.requestAnimationFrame(draw);
      else { if (root.isConnected) root.remove(); win.removeEventListener('resize', resize); }
    }
    win.addEventListener('resize', resize);
    for (let i = 0; i < (big ? 12 : 4); i++) launch();
    win.requestAnimationFrame(draw);
    win.setTimeout(function () { if (root.isConnected) root.remove(); win.removeEventListener('resize', resize); }, big ? 5200 : 3200);
  } catch (e) {}
}
"""


_script_ids = itertools.count()  # 스크립트 컨테이너 key 가 겹치지 않도록


def run_script(js):
    """보이지 않는 iframe 으로 스크립트를 실행(부모 문서를 조작)."""
    with st.container(key=f"gd_script_{next(_script_ids)}"):
        embed_html(f"<script>{js}</script>", 1)


# --------------------------- 전체화면 실험 효과 ---------------------------
def _effect_overlay(kind, attempt_id, aria_label, kicker, hero, headline, copy, particles, meta=""):
    """모든 효과가 같은 구조를 씁니다. 파티클은 카드 밖(오버레이 직속)에 둬야 화면 전체로 퍼집니다."""
    p_html = "".join(
        f'<span class="gd-particle" style="--dx:{dx};--dy:{dy};--d:{i * .05:.2f}s" aria-hidden="true">{emoji}</span>'
        for i, (emoji, dx, dy) in enumerate(particles)
    )
    meta_html = f'<div class="gd-meta">{html.escape(meta)}</div>' if meta else ""
    st.markdown(
        compact(f"""<div class="gd-overlay gd-{kind} is-waiting" id="{kind}-{attempt_id}" role="dialog" aria-modal="true" aria-label="{html.escape(aria_label)}">
        {p_html}
        <div class="gd-card">
          <button class="gd-close" type="button" aria-label="알림 닫기">{icon("x", 22)}</button>
          <div class="gd-kicker">{kicker}</div>
          <div class="gd-emoji" aria-hidden="true">{hero}</div>
          <div class="gd-head">{html.escape(headline)}</div>
          <div class="gd-copy">{copy}</div>
          {meta_html}
        </div>
        <div class="gd-hint">화면을 누르면 닫혀요<span class="gd-hint-k"> (Esc 키도 가능)</span></div>
        </div>"""),
        unsafe_allow_html=True,
    )
    install_effect_dismissal(f"{kind}-{attempt_id}", st.session_state.get("_effect_delay", 0.0), 3.0,
                             get_experiment_notification(), attempt_id)


def show_failure_effect(alpha, attempt_id):
    """실패 효과: 관찰된 상황만 설명하고 원인을 직접 진단하지는 않습니다."""
    if alpha > 1.0:
        headline = "공이 크게 튕겨 나갔어요!"
        message = "공이 목표 지점을 지나 멀리 벗어나면서 움직임이 점점 커지는 상황이에요. 이동 경로를 살펴보고 설정을 바꿔 다시 관찰해 보세요."
    elif np.isclose(alpha, 1.0, atol=1e-8):
        headline = "공이 양쪽을 오가고 있어요!"
        message = "공이 골짜기 양쪽을 번갈아 이동하고 있어요. 움직임이 줄어들지 않아 목표 지점에 머무르지 못한 상황이에요."
    elif 0.5 < alpha < 1.0:
        headline = "목표를 지나쳐 움직이고 있어요!"
        message = "공이 목표 지점을 넘어 반대편으로 이동하고 있어요. 좌우로 오가는 움직임이 나타나며, 이번 실험에서는 착지 조건을 만족하지 못했어요."
    elif 0 < alpha < 0.5:
        headline = "아직 목표에 도착하지 못했어요!"
        message = "공이 한쪽 방향에서 목표에 조금씩 가까워지고 있어요. 이번 실험에서는 정해진 이동이 끝날 때까지 착지 조건을 만족하지 못했어요."
    else:
        headline = "이번 실험은 착지하지 못했어요"
        message = "공이 이번 실험의 목표 조건에 도착하지 못했어요. 이동 경로와 실험 설정을 바꿔 다시 관찰해 보세요."
    particles = [
        ("💣", "-42vw", "-28vh"), ("💥", "38vw", "-30vh"), ("☄️", "-43vw", "18vh"),
        ("🧨", "42vw", "20vh"), ("⚡", "-18vw", "34vh"), ("🔥", "20vw", "-37vh"),
        ("🚨", "-30vw", "-8vh"), ("🪨", "14vw", "-33vh"), ("🌋", "-30vw", "25vh"),
        ("💣", "-18vw", "-22vh"), ("💥", "20vw", "-12vh"), ("🧨", "-8vw", "28vh"),
        ("⚠️", "32vw", "12vh"), ("🔥", "-38vw", "-20vh"), ("💥", "4vw", "38vh"),
    ]
    _effect_overlay(
        "failure", attempt_id, "실험 결과: 착지 실패",
        "⚠️ EXPERIMENT ALERT", "💣 💥 🧨 🔥", headline, html.escape(message), particles,
        meta=f"실험 상황 · 학습률 α={alpha:g}",
    )


def show_success_effect(attempt_id):
    particles = [
        ("🎆", "-34vw", "-35vh"), ("🎇", "30vw", "-30vh"), ("🎉", "-38vw", "20vh"),
        ("✨", "36vw", "28vh"), ("🎊", "-42vw", "-4vh"), ("⭐", "40vw", "-8vh"),
        ("🥳", "-24vw", "34vh"), ("🪅", "22vw", "36vh"), ("💫", "-12vw", "-38vh"),
        ("🌟", "14vw", "-37vh"), ("🎈", "-30vw", "-20vh"), ("🎊", "32vw", "-22vh"),
        ("🎇", "-8vw", "38vh"), ("✨", "44vw", "8vh"), ("🎉", "6vw", "-34vh"),
    ]
    _effect_overlay(
        "success", attempt_id, "실험 결과: 착륙 성공",
        "🎉 LANDING SUCCESS!", "🏆 ⚽ 🥳", "한 번에 최솟값 도착! 성공!",
        "목표 지점에 정확히 도착했어요!<br>α=0.5이면 x_next = x − 0.5·2x = 0이므로 한 번의 업데이트로 최솟값에 도착합니다.<br>성공 점수 100점!",
        particles,
    )


def show_turtle_effect(attempt_id):
    particles = [
        ("🐢", "-42vw", "-22vh"), ("🐢", "38vw", "-28vh"), ("🐌", "-40vw", "24vh"),
        ("💨", "40vw", "18vh"), ("🌿", "-24vw", "-34vh"), ("✨", "27vw", "32vh"),
        ("🐢", "0vw", "-38vh"), ("💚", "-5vw", "35vh"), ("🐌", "43vw", "-4vh"), ("💨", "-43vw", "-4vh"),
    ]
    _effect_overlay(
        "turtle", attempt_id, "실험 결과: 느린 수렴",
        "🐢 TURTLE MODE", "🐢 🐌 💨", "느림보 경사하강법 출동!",
        "목표까지 천천히... 한 걸음씩...<br>거북이 군단 출동! 느려도 꾸준히 수렴하는 중! 🌿",
        particles,
    )


def install_effect_dismissal(effect_id, delay_seconds=0, duration_seconds=3.0, toast_text="기록되었습니다.", attempt_id=None):
    """그래프 애니메이션이 끝났다는 신호를 받으면 효과를 시작하고, 3초 뒤/클릭/Esc 로 닫은 뒤 알림을 띄웁니다.

    신호를 받지 못하는 경우를 대비해 delay_seconds 뒤에는 어차피 시작합니다(안전장치).
    """
    js = r"""
    (() => {
      __TOAST_JS__
      const effectId = __EFFECT_ID__;
      const toastText = __TOAST_TEXT__;
      const targetAttempt = __ATTEMPT__;
      const delayMs = Math.max(0, __DELAY_MS__);
      const durationMs = Math.max(500, __DURATION_MS__);
      let observer = null, closed = false, started = false, autoTimer = null, fallbackTimer = null, onFinish = null, onKey = null;

      function cleanup(doc) {
        if (autoTimer) clearTimeout(autoTimer);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (observer) observer.disconnect();
        if (doc && onFinish) doc.removeEventListener('gd-experiment-animation-finished', onFinish);
        if (doc && onKey) doc.removeEventListener('keydown', onKey, true);
      }
      function closeEffect(doc) {
        if (closed) return;
        closed = true;
        cleanup(doc);
        const el = doc ? doc.getElementById(effectId) : null;
        if (el) { el.classList.add('is-closing'); setTimeout(function () { el.remove(); }, 200); }
        gdToast(doc, toastText, 'check');
      }
      function startEffect(doc, el) {
        if (closed || started) return;
        started = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        el.classList.remove('is-waiting');
        autoTimer = setTimeout(function () { closeEffect(doc); }, durationMs + 100);
      }
      function attach() {
        let doc;
        try { doc = window.parent.document; } catch (e) { return false; }
        const el = doc.getElementById(effectId);
        if (!el) return false;
        if (el.dataset.gdReady === '1') return true;
        el.dataset.gdReady = '1';
        const dismiss = function (ev) {
          if (closed || !started) return;
          if (ev) { ev.preventDefault(); ev.stopPropagation(); }
          closeEffect(doc);
        };
        el.addEventListener('pointerdown', dismiss, true);
        el.addEventListener('click', dismiss, true);
        onKey = function (ev) { if (ev.key === 'Escape') dismiss(ev); };
        doc.addEventListener('keydown', onKey, true);
        onFinish = function (ev) {
          if (ev && ev.detail && String(ev.detail.attemptId) === targetAttempt) startEffect(doc, el);
        };
        doc.addEventListener('gd-experiment-animation-finished', onFinish);
        if ((doc.documentElement.dataset.gdExperimentFinishedAttempt || '') === targetAttempt) startEffect(doc, el);
        else fallbackTimer = setTimeout(function () { startEffect(doc, el); }, delayMs + 150);
        return true;
      }
      try {
        if (attach()) return;
        const doc = window.parent.document;
        observer = new MutationObserver(function () { if (attach() && observer) observer.disconnect(); });
        observer.observe(doc.body, { childList: true, subtree: true });
        setTimeout(function () {
          if (observer) observer.disconnect();
          if (!closed && !started) gdToast(doc, toastText, 'check');
        }, delayMs + durationMs + 4000);
      } catch (e) {}
    })();
    """
    js = (
        js.replace("__TOAST_JS__", TOAST_JS)
        .replace("__EFFECT_ID__", json.dumps(effect_id))
        .replace("__TOAST_TEXT__", json.dumps(toast_text, ensure_ascii=False))
        .replace("__ATTEMPT__", json.dumps(str(attempt_id) if attempt_id is not None else ""))
        .replace("__DELAY_MS__", str(float(delay_seconds) * 1000))
        .replace("__DURATION_MS__", str(float(duration_seconds) * 1000))
    )
    run_script(js)


# --------------------------- 팝업(대화상자) ---------------------------
@st.dialog("🔬 연구소 미션 브리핑", width="large", **DIALOG_KW)
def show_intro_briefing():
    st.markdown(
        compact("""
        <div class="brief-emoji" aria-hidden="true">⚽ 🔎 📈</div>
        <div class="brief">
          <div class="brief-card"><span class="bc-n">1</span><div>
            <div class="bc-t">한 번의 이동으로 최솟값에 도착하는 학습률을 찾아라!</div>
            <div class="bc-s">학습률을 바꿔가며 공의 움직임을 관찰하고, 가장 알맞은 값을 직접 찾아보세요.</div></div></div>
          <div class="brief-card"><span class="bc-n">2</span><div>
            <div class="bc-t">여러 가지 규칙을 발견하고 경사하강법 마스터가 되어라!</div>
            <div class="bc-s">여섯 개의 퀘스트를 완료하고, 실험에서 발견한 규칙을 모아 연구소를 정복하세요.</div></div></div>
        </div>
        """),
        unsafe_allow_html=True,
    )
    if st.button("미션 시작하기 🚀", type="primary", width="stretch", key="intro_start"):
        st.rerun()


@st.dialog("🏆 경사하강법 마스터 달성!", width="large", **DIALOG_KW)
def show_master_celebration():
    st.markdown(
        compact(f"""
        <div class="master-dialog">
          <div class="md-emoji" aria-hidden="true">🏆 🎆 🥳</div>
          <div class="md-title">경사하강법 마스터가 되었습니다!</div>
          <p>모든 퀘스트 보상을 수령했어요. 실험으로 경사하강법의 움직임을 직접 밝혀냈습니다.</p>
          <div class="md-chip">총 보상 {TARGET_XP:,} XP · 퀘스트 6/6</div>
        </div>
        """),
        unsafe_allow_html=True,
    )
    # 불꽃놀이는 팝업이 열려 있는 동안 화면 전체(부모 문서)에서 재생됩니다.
    run_script(FIREWORKS_JS + "gdFireworks(window.parent, {big:true});")
    if st.button("닫기", key="master_close", width="stretch"):
        st.rerun()


# --------------------------- Sidebar ---------------------------
st.sidebar.header("🎮 연구소 컨트롤러")
nickname_input = st.sidebar.text_input("연구원 닉네임", value="익명", max_chars=20)
st.sidebar.markdown(
    compact(f"""<div class="start-chip"><span class="sc-ic">{icon("map-pin", 20)}</span>
    <div><div class="sc-k">시작 위치</div><div class="sc-v">x = {START_X:.1f}<small>(고정)</small></div></div></div>"""),
    unsafe_allow_html=True,
)
alpha_input = st.sidebar.slider(
    "학습률 α", 0.05, 1.50, 0.80, 0.05, format="%.2f", key="alpha_control",
    help="한 번 이동할 때 공이 얼마나 크게 움직일지 정하는 값이에요.",
)
epochs_input = st.sidebar.slider(
    "최대 이동 횟수", 1, 10, 5, 1, key="epochs_control",
    help="공이 최대 몇 번까지 이동할지 정해요. 목표에 도착하면 일찍 끝나요.",
)
run_sidebar = st.sidebar.button("⚽ 실험 실행!", type="primary", width="stretch", key="run_sidebar")

# --------------------------- Hidden rules / quests ---------------------------
RULES = {
    "slow": {"title": "느린 수렴", "description": "학습률이 작으면 공은 목표를 향해 한쪽에서 조금씩 접근한다.", "condition": "0 < α < 0.5"},
    "one_step": {"title": "완벽한 한 번의 착륙", "description": "특정 학습률에서는 첫 업데이트만으로 목표 지점에 도착한다.", "condition": "α = 0.5"},
    "zigzag": {"title": "지그재그 수렴", "description": "공이 목표를 넘나들지만, 매번 목표와의 거리가 줄어든다.", "condition": "0.5 < α < 1"},
    "pingpong": {"title": "무한 핑퐁", "description": "공은 양쪽으로 번갈아 움직이지만 거리의 크기가 줄어들지 않는다.", "condition": "α = 1"},
    "diverge": {"title": "발산 폭주", "description": "공은 목표를 지나칠 뿐 아니라 매번 더 멀리 튕겨 나간다.", "condition": "α > 1"},
}

QUESTS = [
    {"id": "first_success", "title": "첫 번째 착륙", "desc": "공을 목표 지점에 성공적으로 착륙시켜라.", "reward": 1000},
    {"id": "slow", "title": "거북이의 비밀", "desc": "학습률을 바꾸어 느린 수렴 현상을 발견하라.", "reward": 1300},
    {"id": "one_step", "title": "원샷 착륙", "desc": "한 번의 실제 이동으로 목표에 도착하라.", "reward": 3000},
    {"id": "zigzag", "title": "지그재그 탐정", "desc": "목표를 넘나들며 수렴하는 조건을 발견하라.", "reward": 1500},
    {"id": "pingpong", "title": "무한 핑퐁 실험", "desc": "공이 같은 거리로 계속 튕기는 현상을 재현하라.", "reward": 1300},
    {"id": "diverge", "title": "폭주 경보", "desc": "공이 점점 더 멀리 발산하는 조건을 발견하라.", "reward": 1900},
]
QUEST_BY_ID = {q["id"]: q for q in QUESTS}
TOTAL_REWARD_XP = sum(q["reward"] for q in QUESTS)
assert TOTAL_REWARD_XP == TARGET_XP, f"퀘스트 보상 합계 오류: {TOTAL_REWARD_XP:,} XP (목표 {TARGET_XP:,} XP)"


def current_xp():
    """XP 는 항상 '수령한 퀘스트 보상'의 합으로 계산(예전 세션 값과 어긋나지 않게)."""
    return sum(q["reward"] for q in QUESTS if q["id"] in st.session_state.quests_claimed)


st.session_state.xp = current_xp()


def xp_bar_html(xp):
    pct = max(0.0, min(100.0, xp / TARGET_XP * 100))
    return (
        f'<div class="xp-bar" role="progressbar" aria-label="경험치 진행도" aria-valuemin="0" '
        f'aria-valuemax="{TARGET_XP}" aria-valuenow="{xp}"><i style="width:{pct:.1f}%"></i></div>'
    )


# 진행 현황 HUD (연구자 모드에서는 정답지 대신 안내만)
if st.session_state.researcher_mode:
    st.markdown(
        callout("info", "연구자 모드 ON", "퀘스트 센터에서 각 퀘스트의 정답 조건을 확인할 수 있어요.", "flask"),
        unsafe_allow_html=True,
    )
else:
    xp_now = current_xp()
    done_n = sum(q["id"] in st.session_state.quests_done for q in QUESTS)
    claimed_n = sum(q["id"] in st.session_state.quests_claimed for q in QUESTS)
    rules_n = sum(rid in st.session_state.unlocked_rules for rid in RULES)
    st.markdown(
        compact(f"""
        <section class="hud" aria-label="연구소 진행 현황">
          <div class="hud-top">
            <div class="hud-title">🏆 연구소 진행 현황</div>
            <div class="hud-xp"><b>{xp_now:,}</b> / {TARGET_XP:,} XP</div>
          </div>
          {xp_bar_html(xp_now)}
          <div class="stat-grid">
            <div class="stat"><span class="st-ic">{icon("check", 18)}</span><div><div class="st-k">완료한 퀘스트</div><div class="st-v">{done_n} / {len(QUESTS)}</div></div></div>
            <div class="stat"><span class="st-ic">{icon("gift", 18)}</span><div><div class="st-k">수령한 보상</div><div class="st-v">{claimed_n} / {len(QUESTS)}</div></div></div>
            <div class="stat"><span class="st-ic">{icon("unlock", 18)}</span><div><div class="st-k">발견한 규칙</div><div class="st-v">{rules_n} / {len(RULES)}</div></div></div>
          </div>
        </section>
        """),
        unsafe_allow_html=True,
    )

# 모바일에서는 사이드바가 접혀 있으므로 화면 안에도 실행 버튼을 둔다(데스크톱에서는 CSS 로 숨김)
mobile_run_box = st.container(key="mobile_run")
with mobile_run_box:
    run_mobile = st.button("⚽ 실험 실행!", type="primary", width="stretch", key="run_mobile")
    st.caption(f"현재 설정 · α {alpha_input:.2f} · 최대 {epochs_input}회 — 설정은 왼쪽 위 ‘»’ 버튼에서 바꿀 수 있어요.")
run_button = run_sidebar or run_mobile

# --------------------------- Run and record ---------------------------
if run_button:
    st.session_state.quests_visible = False
    nickname = (nickname_input.strip() or "익명")[:20]
    alpha_run = round(float(alpha_input), 2)  # 슬라이더 부동소수 오차(1.0000000000000002 등)로 규칙이 어긋나는 것을 방지
    xs, ys, overflow, steps = run_gradient_descent(START_X, alpha_run, epochs_input)
    final_x, final_loss = float(xs[-1]), float(ys[-1])
    label, code = classify_result(alpha_run, final_x, overflow)
    score = calc_score(final_x, code)
    st.session_state.attempt_id += 1
    attempt_id = st.session_state.attempt_id

    st.session_state.last_result = {
        "nickname": nickname, "alpha": alpha_run, "epochs": int(epochs_input),
        "actual_steps": int(steps), "x_history": xs, "y_history": ys,
        "final_x": final_x, "final_loss": final_loss, "status_label": label,
        "status_code": code, "score": score, "overflow": overflow, "attempt_id": attempt_id,
    }
    # 실행 후 그래프 위치로 부드럽게 스크롤
    run_script(
        """
        function scrollToGraph() {
          try {
            const doc = window.parent.document;
            const h = Array.from(doc.querySelectorAll('h1,h2,h3')).find(function (el) { return (el.innerText || '').includes('공의 이동 경로'); });
            if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (e) {}
        }
        setTimeout(scrollToGraph, 250); setTimeout(scrollToGraph, 900);
        """
    )
    st.session_state.personal_records.append({
        "닉네임": nickname, "학습률": alpha_run, "최대 이동 횟수": epochs_input,
        "실제 이동 횟수": steps, "최종 위치": final_x, "최종 Loss": final_loss,
        "점수": score, "결과": label,
    })

    # 퀘스트/규칙 발견: 관찰된 실험 결과와 선택한 조건으로 판단
    newly_unlocked = []

    def complete_quest(qid):
        if qid not in st.session_state.quests_done:
            st.session_state.quests_done.append(qid)
            q = QUEST_BY_ID[qid]
            newly_unlocked.append(f"{q['title']} 퀘스트 완료! 보상 {q['reward']:,} XP 수령 가능")

    def discover_rule(rid):
        if rid not in st.session_state.unlocked_rules:
            st.session_state.unlocked_rules.append(rid)
            newly_unlocked.append(f"규칙 발견: {RULES[rid]['title']}")

    if code == "success":
        complete_quest("first_success")
    if 0 < alpha_run < 0.5 and steps > 0:
        discover_rule("slow")
        complete_quest("slow")
    if np.isclose(alpha_run, 0.5) and code == "success" and steps == 1:
        discover_rule("one_step")
        complete_quest("one_step")
    if 0.5 < alpha_run < 1.0 and steps >= 2:
        discover_rule("zigzag")
        complete_quest("zigzag")
    if np.isclose(alpha_run, 1.0):
        discover_rule("pingpong")
        complete_quest("pingpong")
    if alpha_run > 1.0:
        discover_rule("diverge")
        complete_quest("diverge")

    st.session_state.quest_notice = newly_unlocked  # 알림은 전체화면 효과가 닫힌 뒤 한 번만 표시됩니다.


# --------------------------- Quest dialog ---------------------------
@st.dialog("🧪 퀘스트 센터", width="large", **DIALOG_KW)
def show_quest_dialog():
    xp_now = current_xp()
    done_n = sum(q["id"] in st.session_state.quests_done for q in QUESTS)
    claimed_n = sum(q["id"] in st.session_state.quests_claimed for q in QUESTS)
    st.markdown(
        compact(f"""
        <div class="panel-heading">
          <div class="ph-row"><span class="ph-kicker">QUEST CENTER</span>
            <span class="ph-xp"><b>{xp_now:,}</b> / {TARGET_XP:,} XP</span></div>
          {xp_bar_html(xp_now)}
          <p class="ph-sub">미션을 완료하고 보상을 수령하세요 · 완료 {done_n}/{len(QUESTS)} · 수령 {claimed_n}/{len(QUESTS)}</p>
        </div>
        """),
        unsafe_allow_html=True,
    )

    if st.session_state.researcher_mode:
        st.markdown(callout("info", "연구자 모드 · 퀘스트 정답", None, "flask"), unsafe_allow_html=True)
        quest_answers = [
            ("첫 번째 착륙", "실험 결과가 착륙 성공이어야 합니다. 최종 위치 |x| < 1e-5."),
            ("거북이의 비밀", "학습률 0 < α < 0.5로 설정해 실험합니다."),
            ("원샷 착륙", "학습률 α = 0.5로 설정합니다. 한 번의 업데이트로 x=0에 도착합니다."),
            ("지그재그 탐정", "학습률 0.5 < α < 1로 설정합니다."),
            ("무한 핑퐁 실험", "학습률 α = 1.0으로 설정합니다. 부호는 바뀌지만 위치의 절댓값은 줄지 않습니다."),
            ("폭주 경보", "학습률 α > 1.0으로 설정합니다. 목표에서 점점 멀어집니다."),
        ]
        for n, (name, answer) in enumerate(quest_answers, 1):
            with st.container(border=True):
                st.markdown(
                    f'<div class="quest-head"><span class="answer-n">{n}</span>'
                    f'<div class="quest-main"><div class="quest-title">{name}</div>'
                    f'<div class="quest-desc">{answer}</div></div></div>',
                    unsafe_allow_html=True,
                )
    else:
        for quest in QUESTS:
            completed = quest["id"] in st.session_state.quests_done
            claimed = quest["id"] in st.session_state.quests_claimed
            state = "claimed" if claimed else "ready" if completed else "locked"
            badge = icon("trophy", 20) if claimed else icon("gift", 20) if completed else icon("lock", 20)
            with st.container(border=True):
                st.markdown(
                    f'<div class="quest-head q-{state}"><span class="quest-badge">{badge}</span>'
                    f'<div class="quest-main"><div class="quest-title">{quest["title"]}</div>'
                    f'<div class="quest-desc">{quest["desc"]}</div></div>'
                    f'<span class="xp-chip">{quest["reward"]:,} XP</span></div>',
                    unsafe_allow_html=True,
                )
                if claimed:
                    st.markdown(f'<span class="quest-state is-claimed">{icon("check", 16)} 보상 수령 완료</span>', unsafe_allow_html=True)
                elif completed:
                    if st.button(f"🎁 {quest['reward']:,} XP 받기", key=f"claim_{quest['id']}", type="primary", width="stretch"):
                        if quest["id"] not in st.session_state.quests_claimed:
                            st.session_state.quests_claimed.append(quest["id"])
                            st.session_state.xp = current_xp()
                        all_claimed = (
                            all(qid in st.session_state.quests_done for qid in REQUIRED_QUEST_IDS)
                            and all(qid in st.session_state.quests_claimed for qid in REQUIRED_QUEST_IDS)
                        )
                        if all_claimed:
                            # 마스터 달성: 전체 화면을 새로 그리고 마스터 팝업(자체 불꽃놀이)을 연다
                            if not st.session_state.master_popup_shown and not st.session_state.master_popup_pending:
                                st.session_state.master_popup_pending = True
                            st.session_state.quest_firework = False
                            st.session_state.quests_visible = False
                            st.rerun()
                        else:
                            st.session_state.quest_firework = True
                            st.rerun(scope="fragment")
                else:
                    st.markdown(f'<span class="quest-state is-locked">{icon("lock", 14)} 미완료 — 실험 조건을 바꾸어 도전하세요.</span>', unsafe_allow_html=True)

        if st.session_state.quest_firework:
            st.session_state.quest_firework = False
            run_script(
                TOAST_JS + FIREWORKS_JS
                + "gdFireworks(window.parent, {big:false, label:'🎁 REWARD CLAIMED!'});"
                + "gdToast(window.parent.document, '퀘스트 보상을 수령했습니다.', 'gift');"
            )

    if st.button("닫기", key="quest_close", width="stretch"):
        st.rerun()  # 전체를 다시 그려 화면 바깥의 진행 현황(XP 등)도 최신으로


# 팝업은 '한 번 열기' 요청으로 취급: 닫힌 뒤 다른 버튼을 눌러도 다시 뜨지 않도록 열기 전에 플래그를 내립니다.
if not st.session_state.intro_popup_shown:
    st.session_state.intro_popup_shown = True
    show_intro_briefing()
elif st.session_state.quests_visible:
    st.session_state.quests_visible = False
    show_quest_dialog()
elif (
    st.session_state.master_popup_pending
    and is_research_lab_master
    and not st.session_state.master_popup_shown
):
    st.session_state.master_popup_shown = True
    st.session_state.master_popup_pending = False
    show_master_celebration()


# --------------------------- Graph (canvas) ---------------------------
GRAPH_HTML = r"""
<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:transparent;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;color:#142B4A}
  .card{height:100%;display:flex;flex-direction:column;background:#fff;border:1px solid #D2DFEC;border-radius:16px;box-shadow:0 1px 2px rgba(20,43,74,.06),0 2px 8px rgba(20,43,74,.05);overflow:hidden}
  .bar{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid #E6EEF6;background:linear-gradient(180deg,#F5FBFE,#fff)}
  .chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:#E5F6FD;border:1px solid #B5E0F0;color:#0B6B84;font-weight:800;font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .chip.status{background:#fff;border-color:#D2DFEC;color:#26374F;font-weight:700}
  .chip.status.done{background:#E6F7EE;border-color:#8FD1AB;color:#14532D}
  .dot{width:8px;height:8px;border-radius:50%;background:#38D5E8}
  .done .dot{background:#1F7A4D}
  button.act{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:6px 14px;border-radius:10px;border:1.5px solid #8FDCEA;background:#fff;color:#142B4A;font:700 13px/1 inherit;font-family:inherit;cursor:pointer;transition:background-color .15s,border-color .15s,transform .1s;touch-action:manipulation}
  button.act:hover{background:#E5F6FD;border-color:#38D5E8}
  button.act:active{transform:scale(.97)}
  button.act:focus-visible{outline:3px solid #1769AA;outline-offset:2px}
  button.act[hidden]{display:none}
  .plot{position:relative;flex:1;min-height:200px}
  canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  .empty{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);max-width:min(86%,360px);text-align:center;background:rgba(255,255,255,.94);border:1px solid #B5E0F0;border-radius:14px;padding:12px 16px;font-size:14px;line-height:1.55;font-weight:500;color:#26374F;box-shadow:0 6px 20px rgba(20,43,74,.10)}
  .empty b{color:#1769AA}
  .legend{display:flex;flex-wrap:wrap;gap:6px 16px;padding:8px 14px 10px;border-top:1px solid #E6EEF6;font-size:12.5px;color:#586A82}
  .legend span{display:inline-flex;align-items:center;gap:6px}
  .lg-dot{width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #F0603A}
  .lg-line{width:20px;height:4px;border-radius:3px;background:#F0603A}
  .lg-curve{width:20px;height:4px;border-radius:3px;background:#1F6FB5}
  .lg-star{width:14px;height:14px;background:#F4B400;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style></head>
<body>
<div class="card">
  <div class="bar">
    <div class="chips">
      <span class="chip" id="stepChip"></span>
      <span class="chip status" id="status" role="status" aria-live="polite"><i class="dot"></i><span id="statusText"></span></span>
    </div>
    <button class="act" id="actBtn" type="button" hidden></button>
  </div>
  <div class="plot" id="plot">
    <canvas id="cv" role="img" aria-label="__ARIA__"></canvas>
    <div class="empty" id="empty" hidden>왼쪽 설정에서 <b>학습률 α</b>와 <b>이동 횟수</b>를 정하고<br><b>실험 실행</b>을 눌러 보세요.</div>
  </div>
  <div class="legend" aria-hidden="true">
    <span><i class="lg-curve"></i>함수 y = x²</span>
    <span><i class="lg-line"></i>공이 지나간 길</span>
    <span><i class="lg-dot"></i>멈춘 위치</span>
    <span><i class="lg-star"></i>목표(최솟값)</span>
  </div>
  <p class="sr">__SR__</p>
</div>
<script>
(() => {
  const POINTS = __POINTS__;
  const ATTEMPT = __ATTEMPT__;
  const IDLE = __IDLE__;
  const MOVE_MS = __MOVE_MS__, HOLD_MS = __HOLD_MS__, START_HOLD = __START_HOLD__;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const C = { ink:'#142B4A', muted:'#586A82', grid:'#E6EEF6', axis:'#8CA0B6', curve:'#1F6FB5', trail:'#F0603A', trailDark:'#B83A1B', gold:'#F4B400', goldDark:'#8A5A00', bowl:'rgba(56,213,232,' };
  const $ = (id) => document.getElementById(id);
  const plot = $('plot'), cv = $('cv'), ctx = cv.getContext('2d');
  const stepChip = $('stepChip'), statusEl = $('status'), statusText = $('statusText'), actBtn = $('actBtn');
  const total = POINTS.length - 1;

  /* ---------- 눈금: 1, 2, 5 단위의 둥근 값 ---------- */
  function niceCeil(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; const s = [1,1.2,1.5,2,2.5,3,4,5,6,8,10]; for (const k of s) if (m <= k + 1e-9) return k * e; return 10 * e; }
  function niceStep(raw) { const e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; }
  const maxAbsX = Math.max(1e-9, ...POINTS.map(p => Math.abs(p.x)));
  const maxY = Math.max(...POINTS.map(p => p.y));
  const xLim = niceCeil(Math.max(10, maxAbsX * 1.2));
  const yMax = niceCeil(Math.max(70, maxY * 1.1));
  const yMin = -yMax * 0.045;
  let nf = null; try { nf = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }); } catch (e) {}
  function fmt(v) { const s = (Math.abs(v) >= 10000 && nf) ? nf.format(v) : (Math.round(v * 100) / 100).toLocaleString('ko-KR'); return s.replace('-', '\u2212'); }

  /* ---------- 크기/좌표 ---------- */
  let W = 0, H = 0, pw = 0, ph = 0; const M = { l: 60, r: 18, t: 14, b: 50 };
  const X = (x) => M.l + (x + xLim) / (2 * xLim) * pw;
  const Y = (y) => M.t + (1 - (y - yMin) / (yMax - yMin)) * ph;
  function resize() {
    const r = plot.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    M.l = W < 420 ? 48 : 60; pw = W - M.l - M.r; ph = H - M.t - M.b;
    draw(lastState);
  }

  /* ---------- 그리기 도구 ---------- */
  function pent(cx, cy, r, rot) { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = rot + i * 2 * Math.PI / 5; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); }
  function star(cx, cy, R, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 === 0 ? R : r, a = -Math.PI / 2 + i * Math.PI / 5; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); }
  function pill(text, cx, cy, fg, bg, border) {
    ctx.font = '700 12px "Noto Sans KR",sans-serif'; const tw = ctx.measureText(text).width, w = tw + 16, h = 20;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 10) : ctx.rect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = border; ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + .5);
  }
  function ball(cx, cy, r) {
    ctx.save(); ctx.shadowColor = 'rgba(20,43,74,.38)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1B2A3F'; pent(cx, cy, r * .36, -Math.PI / 2); ctx.fill();
    ctx.strokeStyle = '#1B2A3F'; ctx.lineWidth = 1.3;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5, b = a + Math.PI / 5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * .36, cy + Math.sin(a) * r * .36); ctx.lineTo(cx + Math.cos(a) * r * .72, cy + Math.sin(a) * r * .72); ctx.stroke();
      pent(cx + Math.cos(b) * r * 1.0, cy + Math.sin(b) * r * 1.0, r * .27, b + Math.PI); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 1.6; ctx.strokeStyle = '#1B2A3F'; ctx.stroke();
  }
  function curveTo(x0, x1) { // 곡선 위를 따라 x0 → x1 구간 경로
    const n = Math.max(2, Math.ceil(Math.abs(X(x1) - X(x0)) / 3));
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; const px = X(x), py = Y(x * x); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  }

  /* ---------- 상태(애니메이션 진행) ---------- */
  const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const FINAL = { k: Math.max(0, total), prog: 1, moving: false, done: true, step: Math.max(0, total) };
  const START = { k: 0, prog: 0, moving: false, done: false, step: 0 };
  let lastState = IDLE ? START : FINAL;
  function stateAt(ms) {
    if (total <= 0) return FINAL;
    const t = ms - START_HOLD; if (t < 0) return START;
    const per = MOVE_MS + HOLD_MS, k = Math.floor(t / per);
    if (k >= total) return FINAL;
    const inK = t - k * per;
    if (inK < MOVE_MS) return { k: k, prog: ease(inK / MOVE_MS), moving: true, done: false, step: k + 1 };
    return { k: k + 1, prog: 1, moving: false, done: false, step: k + 1 };
  }

  function draw(st) {
    lastState = st;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    /* 눈금 */
    const xTicks = Math.max(4, Math.floor(pw / 56)), xStep = niceStep(2 * xLim / xTicks), yStep = niceStep((yMax - 0) / 5);
    ctx.font = '12px "Noto Sans KR",sans-serif'; ctx.lineWidth = 1;
    for (let y = 0; y <= yMax + 1e-9; y += yStep) { const yy = Y(y); ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(M.l, yy); ctx.lineTo(M.l + pw, yy); ctx.stroke(); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText(fmt(y), M.l - 8, yy); }
    for (let x = Math.ceil(-xLim / xStep) * xStep; x <= xLim + 1e-9; x += xStep) { const xx = X(x); ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(xx, M.t); ctx.lineTo(xx, M.t + ph); ctx.stroke(); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText(fmt(Math.abs(x) < 1e-9 ? 0 : x), xx, M.t + ph + 16); }
    /* 축 제목 */
    ctx.fillStyle = C.ink; ctx.font = '700 12.5px "Noto Sans KR",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('공의 위치 x', M.l + pw / 2, H - 10);
    ctx.save(); ctx.translate(13, M.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('함숫값 y = x²', 0, 0); ctx.restore();
    /* 그래프 영역 안쪽만 그리기 */
    ctx.save(); ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
    // 골짜기(곡선 위쪽) 채우기
    ctx.beginPath(); curveTo(-xLim, xLim); ctx.lineTo(X(xLim), M.t - 4); ctx.lineTo(X(-xLim), M.t - 4); ctx.closePath();
    const g = ctx.createLinearGradient(0, M.t, 0, M.t + ph); g.addColorStop(0, C.bowl + '.02)'); g.addColorStop(1, C.bowl + '.16)'); ctx.fillStyle = g; ctx.fill();
    // 축
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(X(0), M.t); ctx.lineTo(X(0), M.t + ph); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M.l, Y(0)); ctx.lineTo(M.l + pw, Y(0)); ctx.stroke();
    // 곡선
    ctx.beginPath(); curveTo(-xLim, xLim); ctx.strokeStyle = C.curve; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();

    const reached = Math.min(st.k, total);
    const bx = st.moving ? POINTS[st.k].x + (POINTS[st.k + 1].x - POINTS[st.k].x) * st.prog : POINTS[reached].x;
    // 공이 지나간 길(곡선을 따라)
    if (!IDLE) {
      ctx.strokeStyle = C.trail; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < reached; i++) { ctx.beginPath(); curveTo(POINTS[i].x, POINTS[i + 1].x); ctx.stroke(); }
      if (st.moving) { ctx.beginPath(); curveTo(POINTS[st.k].x, bx); ctx.stroke(); }
    }
    // 목표(별)
    const gx = X(0), gy = Y(0); star(gx, gy, 11, 5); ctx.fillStyle = C.gold; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = C.goldDark; ctx.stroke();
    ctx.restore();

    /* 멈춘 위치(점 + 번호) */
    if (!IDLE) {
      let lastLabel = null;
      for (let i = 0; i <= reached; i++) {
        const px = X(POINTS[i].x), py = Y(POINTS[i].y);
        if (px < M.l - 2 || px > M.l + pw + 2 || py < M.t - 2 || py > M.t + ph + 2) continue;
        ctx.beginPath(); ctx.arc(px, py, i === 0 ? 6.5 : 5.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = C.trail; ctx.stroke();
        if (i > 0 && (!lastLabel || Math.hypot(px - lastLabel[0], py - lastLabel[1]) > 22)) {
          const ly = py - 17 < M.t + 8 ? py + 17 : py - 17;
          ctx.beginPath(); ctx.arc(px, ly, 9, 0, Math.PI * 2); ctx.fillStyle = C.trailDark; ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = '800 11px "Noto Sans KR",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i), px, ly + .5);
          lastLabel = [px, ly];
        }
      }
    }
    /* 시작 표시 + 목표 라벨 */
    const sx = X(POINTS[0].x), sy = Y(POINTS[0].y);
    if (!(lastState.k === 0 && !lastState.moving)) pill('시작', (sx + 26 + 22 > W ? sx - 26 : sx + 26), Math.max(M.t + 12, sy - 4), '#0B6B84', '#E5F6FD', '#B5E0F0');
    pill('목표', gx + 28, gy - 22, '#8A5A00', '#FFF6DC', '#EBC565');
    /* 공 */
    const ballX = X(bx), ballY = Y(bx * bx);
    if (ballX > M.l - 14 && ballX < M.l + pw + 14 && ballY > M.t - 14 && ballY < M.t + ph + 14) {
      if (IDLE || (lastState.k === 0 && !lastState.moving)) { ctx.beginPath(); ctx.arc(ballX, ballY, 20, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(56,213,232,.65)'; ctx.lineWidth = 3; ctx.stroke(); }
      ball(ballX, ballY, 12.5);
    } else { // 화면 밖으로 날아간 경우: 가장자리에 표시
      const ex = Math.min(Math.max(ballX, M.l + 12), M.l + pw - 12), ey = Math.min(Math.max(ballY, M.t + 12), M.t + ph - 12);
      ball(ex, ey, 11);
    }
  }

  /* ---------- 상태 표시 / 신호 ---------- */
  let signaled = false;
  function signalFinished() {
    if (IDLE || signaled) return; signaled = true;
    try {
      const doc = window.parent.document;
      doc.documentElement.dataset.gdExperimentFinishedAttempt = String(ATTEMPT);
      doc.dispatchEvent(new window.parent.CustomEvent('gd-experiment-animation-finished', { detail: { attemptId: ATTEMPT } }));
    } catch (e) {}
  }
  let shownPhase = '';
  function setPhase(phase) {
    if (phase === shownPhase) return; shownPhase = phase;
    statusEl.classList.toggle('done', phase === 'done');
    statusText.textContent = phase === 'idle' ? '준비 완료' : phase === 'play' ? '공이 굴러가는 중…' : '이동 완료';
    actBtn.hidden = (IDLE || total <= 0);
    actBtn.textContent = phase === 'done' ? '↻ 다시 보기' : '⏭ 건너뛰기';
    actBtn.setAttribute('aria-label', phase === 'done' ? '애니메이션 다시 보기' : '애니메이션 건너뛰기');
  }
  function updateUI(st) {
    stepChip.textContent = IDLE ? ('시작 위치 x = ' + POINTS[0].x) : ('이동 ' + st.step + ' / ' + total);
  }

  /* ---------- 재생 루프 ---------- */
  let raf = 0, t0 = null, playing = false;
  function loop(ts) {
    if (t0 === null) t0 = ts;
    const st = stateAt(ts - t0);
    draw(st); updateUI(st);
    if (st.done) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }
  function play() { cancelAnimationFrame(raf); t0 = null; playing = true; setPhase('play'); raf = requestAnimationFrame(loop); }
  function finish() { cancelAnimationFrame(raf); playing = false; draw(FINAL); updateUI(FINAL); setPhase('done'); signalFinished(); }
  actBtn.addEventListener('click', () => { if (playing) finish(); else play(); });

  function init() {
    resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(plot); else window.addEventListener('resize', resize);
    if (IDLE) { $('empty').hidden = false; setPhase('idle'); updateUI(START); draw(START); return; }
    if (total <= 0 || reduce) { finish(); return; }
    updateUI(START); draw(START); play();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!playing) draw(lastState); });
  init();
})();
</script>
</body></html>
"""


def render_graph(xs_values, attempt_id, idle=False):
    points = [{"x": float(x), "y": float(x) ** 2} for x in xs_values]
    n_moves = len(points) - 1
    if idle:
        aria = f"이차함수 y = x² 그래프입니다. 공이 x = {START_X:g} 위치에서 출발을 기다리고 있어요."
        sr = "실험을 실행하면 공이 곡선을 따라 목표 지점 x = 0으로 이동합니다."
    else:
        path = " → ".join(f"{p['x']:.4g}" for p in points)
        aria = f"이차함수 y = x² 위에서 공이 x = {points[0]['x']:g}에서 출발해 {n_moves}번 이동했고 최종 위치는 x = {points[-1]['x']:.6g}입니다."
        sr = f"이동 기록(x 좌표): {path}"
    page = (
        GRAPH_HTML.replace("__POINTS__", json.dumps(points))
        .replace("__ATTEMPT__", str(int(attempt_id)))
        .replace("__IDLE__", "true" if idle else "false")
        .replace("__MOVE_MS__", str(ANIM_MOVE_MS))
        .replace("__HOLD_MS__", str(ANIM_HOLD_MS))
        .replace("__START_HOLD__", str(ANIM_START_HOLD))
        .replace("__ARIA__", html.escape(aria, quote=True))
        .replace("__SR__", html.escape(sr))
    )
    embed_html(page, 560)


# --------------------------- Current experiment graph/results ---------------------------
st.divider()
graph_col, score_col = st.columns([2, 1], gap="large")
result = st.session_state.last_result

with graph_col:
    st.subheader("🏔️ 공의 이동 경로")
    if result is None:
        render_graph([START_X], 0, idle=True)
        st.caption("공은 y = x² 곡선 위를 따라 이동하고, 멈춘 위치마다 번호가 남아요. 실험을 실행하면 자동으로 재생됩니다.")
    else:
        xs_anim = np.asarray(result["x_history"], dtype=float)
        render_graph(xs_anim, result["attempt_id"])
        st.caption("공은 y = x² 곡선 위를 따라 이동하고, 멈춘 위치마다 번호가 남아요. ‘건너뛰기’로 바로 결과를 볼 수 있어요.")
        if abs(result["final_x"]) > 12:
            st.markdown(
                callout("warn", "공이 시작점보다 훨씬 멀리 날아갔어요",
                        "그래프 눈금을 자동으로 넓혀서 초반 움직임은 작게 보일 수 있어요. 정확한 위치는 오른쪽 결과에서 확인하세요.", "zap"),
                unsafe_allow_html=True,
            )

with score_col:
    st.subheader("📟 이번 실험 결과")
    if result is None:
        st.markdown(callout("info", "아직 실험 기록이 없어요", "사이드바에서 설정하고 실험을 시작하세요.", "flask"), unsafe_allow_html=True)
    else:
        code = result["status_code"]
        if st.session_state.effect_shown_for_attempt != result["attempt_id"]:
            # 전체화면 효과는 그래프 애니메이션이 끝났다는 신호를 받으면 시작합니다.
            # 아래 지연 시간은 신호를 못 받았을 때를 위한 안전장치입니다.
            n_moves = max(0, len(xs_anim) - 1)
            anim_ms = ANIM_START_HOLD + n_moves * (ANIM_MOVE_MS + ANIM_HOLD_MS)
            st.session_state["_effect_delay"] = anim_ms / 1000.0 + 0.5
            if result["alpha"] < 0.5:
                show_turtle_effect(result["attempt_id"])  # α < 0.5 는 결과와 상관없이 거북이 모드
            elif code == "success":
                show_success_effect(result["attempt_id"])  # α=0.5 한 번에 착륙도 일반 성공 효과
            else:
                show_failure_effect(result["alpha"], result["attempt_id"])
            st.session_state.effect_shown_for_attempt = result["attempt_id"]

        status_ui = {
            "success": ("ok", "착륙 성공!", "목표 위치에 도착했어요.", "check"),
            "explode": ("bad", "우주폭발!", "공이 목표에서 멀어졌어요.", "zap"),
            "pingpong": ("warn", "무한 핑퐁!", "거리가 줄어들지 않아요.", "repeat"),
            "oscillating": ("warn", "지그재그 수렴 중!", "튕기지만 점점 가까워져요.", "activity"),
            "landing": ("info", "아직 착륙 중이에요.", "더 많은 이동이 필요할 수 있어요.", "info"),
        }[code]
        score = int(result["score"])
        st.markdown(
            compact(callout(*status_ui)
            + f"""
            <div class="res-score">
              <div class="lbl">🏅 점수</div>
              <div class="val">{score}<small>/ 100</small></div>
              <div class="xp-bar" role="progressbar" aria-label="점수" aria-valuemin="0" aria-valuemax="100" aria-valuenow="{score}"><i style="width:{score}%"></i></div>
            </div>
            <div class="res-rows">
              <div class="res-row"><span class="k">📍 최종 위치</span><span class="v">{fmt_num(result['final_x'])}</span></div>
              <div class="res-row"><span class="k">📉 최종 Loss</span><span class="v">{fmt_num(result['final_loss'])}</span></div>
              <div class="res-row"><span class="k">🔁 실제 이동 횟수<small>목표에 도착하면 일찍 끝나요</small></span><span class="v">{result['actual_steps']}회</span></div>
            </div>
            <p class="res-note">최대 이동 횟수 {result['epochs']}회 · 성공 기준 |x| &lt; {SUCCESS_THRESHOLD:.5f}</p>
            """),
            unsafe_allow_html=True,
        )

# --------------------------- Personal records ---------------------------
st.divider()
st.header("📒 내 개인 기록")
st.caption("현재 브라우저 세션에서 실행한 실험 기록입니다.")
df = pd.DataFrame(st.session_state.personal_records)
if df.empty:
    st.markdown(callout("info", "아직 개인 기록이 없어요", "실험을 실행하면 결과가 저장됩니다.", "flask"), unsafe_allow_html=True)
else:
    st.markdown(
        compact(f"""
        <div class="stat-grid" style="margin-bottom:14px">
          <div class="stat"><span class="st-ic">{icon("flask", 18)}</span><div><div class="st-k">총 플레이</div><div class="st-v">{len(df)}회</div></div></div>
          <div class="stat"><span class="st-ic">{icon("trophy", 18)}</span><div><div class="st-k">최고 점수</div><div class="st-v">{int(df['점수'].max())}점</div></div></div>
          <div class="stat"><span class="st-ic">{icon("check", 18)}</span><div><div class="st-k">성공 횟수</div><div class="st-v">{int((df['결과'] == '착륙 성공').sum())}회</div></div></div>
        </div>
        """),
        unsafe_allow_html=True,
    )
    st.dataframe(
        df.iloc[::-1],
        width="stretch",
        hide_index=True,
        column_config={
            "학습률": st.column_config.NumberColumn(format="%.2f"),
            "최종 위치": st.column_config.NumberColumn(format="%.6g"),
            "최종 Loss": st.column_config.NumberColumn(format="%.6g"),
            "점수": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d"),
        },
    )
    st.download_button(
        "📥 내 기록 CSV 다운로드",
        data=df.to_csv(index=False).encode("utf-8-sig"),
        file_name="my_gradient_descent_records.csv",
        mime="text/csv",
        width="stretch",
    )
    chart_df = df.copy()
    chart_df["도전 번호"] = np.arange(1, len(chart_df) + 1)
    st.subheader("도전할수록 점수가 어떻게 달라질까?")
    score_chart = (
        alt.Chart(chart_df)
        .mark_line(color="#1769AA", strokeWidth=3, point=alt.OverlayMarkDef(filled=True, fill="#FFFFFF", stroke="#1769AA", strokeWidth=2.5, size=90))
        .encode(
            x=alt.X("도전 번호:Q", axis=alt.Axis(tickMinStep=1, format="d", title="도전 번호", grid=False)),
            y=alt.Y("점수:Q", scale=alt.Scale(domain=[0, 100]), axis=alt.Axis(title="점수", gridColor="#E6EEF6")),
            tooltip=["도전 번호", "점수", "학습률", "결과"],
        )
        .properties(height=240)
    )
    try:
        st.altair_chart(score_chart, width="stretch")
    except TypeError:  # 구버전 호환
        st.altair_chart(score_chart, use_container_width=True)

st.divider()
st.caption("경사하강법 시뮬레이터 · 실험하고 발견하고 해금하세요!")
