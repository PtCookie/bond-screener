# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

공공데이터포털(data.go.kr)이 제공하는 금융위원회 채권 오픈API 2종(기본정보, 시세정보)을 조회하는 Astro 기반 웹 애플리케이션. React Islands 패턴으로 인터랙티브 UI를 구성하고, Cloudflare Workers에 배포한다.

## Commands

```bash
pnpm dev              # 개발 서버 시작 (localhost:4321)
pnpm build            # 프로덕션 빌드 (./dist/)
pnpm preview          # 빌드 결과 로컬 미리보기
pnpm lint             # ESLint 실행
pnpm format           # Prettier 포매팅 실행
pnpm test             # Vitest watch 모드 실행
pnpm test --run       # Vitest 1회 실행 (CI/훅과 동일)
pnpm test <file>      # 특정 파일 테스트 실행
pnpm generate-types   # wrangler.jsonc 기반 Cloudflare 바인딩 타입 생성 (worker-configuration.d.ts)
pnpm deploy           # 빌드 후 Cloudflare Workers에 배포 (astro build && wrangler deploy)
pnpm prepare          # lefthook 설치 (최초 세팅 시 자동 실행됨)
```

## Git Hooks (lefthook)

- **pre-commit**: staged 파일에 `tsc --noEmit` 타입 체크 + ESLint + Prettier 자동 실행 (`*.{js,mjs,ts,tsx,astro,css,json}`)
- **pre-push**: `pnpm test --run` 실행
- `pnpm prepare` 로 lefthook 설치 (초기 세팅 시 필요)

## 알려진 이슈

- Vitest 4.x는 `"ssr"` 환경에 `resolve.external`을 강제 설정하는데, `@astrojs/cloudflare` 어댑터가 등록하는 `@cloudflare/vite-plugin`도 같은 이름의 환경을 쓰면서 이를 금지해 `pnpm test` 시작 자체가 실패한다. `astro.config.mjs`는 `process.env.VITEST`일 때 `adapter`를 비활성화해 이를 우회하므로, 이 조건 분기를 제거하지 말 것.

## Tech Stack

- **Astro v7** — 페이지 라우팅 및 정적/서버 렌더링 (`output: "server"`)
- **React 19** — Astro Islands로 인터랙티브 컴포넌트
- **shadcn/ui** (`@base-ui/react` 기반, Phosphor 아이콘) — UI 컴포넌트 라이브러리 (`src/components/ui/`)
- **Tailwind v4** — `@tailwindcss/vite` 플러그인
- **Cloudflare Workers** — 배포 플랫폼. `@astrojs/cloudflare` 어댑터 이미 설정됨
- **Vitest** — 단위/통합 테스트
- **ESLint** / **Prettier** — 린팅 / 포매팅

서버 상태 관리 라이브러리(TanStack Query 등)는 아직 도입되지 않았다. 필요해지면 `pnpm add`로 추가하고 이 문서를 갱신할 것.

## Architecture

### Astro + React Islands

`.astro` 파일은 서버에서 렌더링되고, 인터랙티브 기능이 필요한 컴포넌트에만 `client:*` 디렉티브로 React를 사용한다 (예: `<BondTable client:load />`).

### 데이터 페칭 패턴

오픈API 호출은 `src/lib/` 또는 `src/api/`에 분리한다. Astro 페이지에서 서버 사이드로 초기 데이터를 페칭한 뒤 React island에 props로 전달하는 패턴을 기본으로 한다.

### Cloudflare 배포

`@astrojs/cloudflare` 어댑터 사용, `astro.config.mjs`에서 `output: "server"` 설정 완료. `wrangler.jsonc`의 `main`이 어댑터 entrypoint를 직접 가리키므로 별도 Workers 진입점 파일은 없다. 시크릿(`serviceKey` 등)은 `Astro.locals.runtime.env` 또는 `import.meta.env`로 접근한다.
- **로컬 개발**(`pnpm dev`/`wrangler dev`): 프로젝트 루트에 `.dev.vars` 또는 `.env` 파일에 `KEY="VALUE"` 형식으로 넣는다. **둘 중 하나만 사용할 것** — `.dev.vars`가 존재하면 `.env`의 값은 무시된다. 오픈API 인증키는 `BOND_API_SERVICE_KEY`라는 이름으로 넣는다(`.claude/skills/probe-bond-api`가 이 이름을 찾는다).
- **배포**(`wrangler deploy`): `.dev.vars`/`.env`는 로컬 전용이라 배포된 Worker에는 전달되지 않는다. 반드시 `wrangler secret put <NAME>`으로 Cloudflare 플랫폼에 시크릿을 등록해야 하며, `wrangler deploy`는 그 등록된 값을 그대로 바인딩한다.
- `.dev.vars`, `.env`는 커밋 금지 (`.gitignore`에 `.dev.vars*`, `.env*` 패턴으로 등록됨).
- 바인딩 타입을 바꾼 뒤에는 `pnpm generate-types`로 `worker-configuration.d.ts`를 갱신한다.

### 디렉터리 구조

```
docs/
  api/            # 오픈API 2종 명세 문서 (src/api/와 1:1 대응)
src/
  api/            # 오픈API 요청/응답 TypeScript 타입·상수. fetch 클라이언트는 아직 미구현
  components/     # React 및 Astro 컴포넌트
    ui/           # shadcn/ui 컴포넌트 (자동 생성, 직접 수정 가능)
  layouts/        # Astro 레이아웃
  lib/            # 유틸리티 (utils.ts 등)
  pages/          # 파일 기반 라우팅
```

`src/api/`에 두 API의 요청/응답 TypeScript 타입이, `docs/api/`에 전체 필드 명세 문서가 있다.

## 오픈API 명세

공공데이터포털 금융위원회 채권 오픈API 2종. **전체 필드·파라미터 명세는 [`docs/api/README.md`](./docs/api/README.md), [`docs/api/bond-issu-info.md`](./docs/api/bond-issu-info.md), [`docs/api/bond-price-info.md`](./docs/api/bond-price-info.md)를, 대응 타입은 `src/api/`를 참고.** 여기서는 요약만 다룬다.

정본은 세 곳이며 우선순위는 다음과 같다: ① `openapi.do` 페이지의 Swagger UI(응답 스키마·서비스 URL의 최신 정본, 단 요청 파라미터는 비어 있음) → ② 리포지터리 루트의 `GetBondIssuInfoService_V2.docx`/`GetBondSecuritiesInfoService.docx`(요청 파라미터의 유일한 정본) → ③ 카탈로그 `openapi.json`(`https://www.data.go.kr/catalog/15059592/openapi.json`, `.../15094784/openapi.json`)은 데이터셋 메타데이터일 뿐 파라미터·스키마는 없으므로 참고용으로만 사용.

### 공통 규약

- 인증: 쿼리스트링 `serviceKey` (공공데이터포털에서 발급받은 인증키, Decoded 값을 `URLSearchParams`에 넣을 것 — 이중 인코딩 주의)
- `resultType` 기본값은 **`xml`**. JSON 응답을 원하면 매 요청에 `resultType=json`을 명시해야 한다.
- **오류도 HTTP 200으로 응답한다.** 반드시 `response.header.resultCode === "00"`을 확인할 것.
- **에러코드는 docx 발행 이후 포털에서 개편되었다.** 현행 코드(`01/04/05/10/12/20×3/22/23/29/30/31`)와 docx의 레거시 코드(`1/10/12/20/22/30/31/32/99`)가 다르므로 반드시 `docs/api/README.md`의 현행 표를 기준으로 판단할 것. 특히 `20`이 서로 다른 메시지 3개에 중복 배정되어 있어 `resultCode`만으로는 분기할 수 없고 `resultMsg`를 함께 봐야 하며, `23`(초당 호출 초과)이 신설되었다.
- 응답 봉투: `response.header{resultCode,resultMsg}` + `response.body{numOfRows,pageNo,totalCount,items.item[]}`. **조회 결과가 0건이면 `items`가 객체가 아니라 빈 문자열(`""`)로 온다.**
- 페이징: `pageNo`, `numOfRows`. 제한: 30 TPS, 개발계정 일 10,000건, 최대 메시지 4000 byte, 평균 응답 500ms
- 데이터 갱신주기: 일 1회, **기준일자 기준 영업일 +1일 오후 1시 이후 반영** (예: 금요일 데이터는 차주 월요일)
- 채권기본정보의 응답 필드는 **전부 문자열**(숫자·날짜 포함)이다. 채권시세정보는 가격·수익률·거래량 계열 11개 필드가 Swagger 스키마상 JSON 기준 `number`로 선언되어 있어 두 API의 숫자 표현 규약이 다르다(`src/api/common.ts`의 `NumericLike` 참고). 빈 값은 `""` 또는 문자열 `"NULL"`로 오므로 파싱 계층에서 정규화가 필요하다.

### ① 채권기본정보 — `GetBondIssuInfoService_V2`

- 베이스 URL: `https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2` (경로에 `/service/` 없음)
- 오퍼레이션: `getBondBasiInfo_V2`
- **필수 조건**: `basDt`(기준일자) / `crno`(법인등록번호) / `isinCd`(ISIN코드) 중 **최소 하나**를 넘겨야 한다. 전부 생략하면 전체 최신 데이터 조회로 빠져 timeout이 발생한다. (docx의 요청 파라미터 표에는 `isinCd`가 누락되어 있으나, 상세기능 설명문과 포털 설명은 모두 이를 포함한다.)
- 선택 파라미터: `basDt`(YYYYMMDD), `crno`(13자리), `isinCd`(12자리), `bondIsurNm`(채권발행인명, 최대 100자)
- 응답 필드 75개 전체는 `docs/api/bond-issu-info.md` 참고. 주요 필드: `isinCd`/`isinCdNm`, `bondIsurNm`(발행인명), `bondIssuDt`/`bondExprDt`(발행일/만기일), `bondSrfcInrt`(표면이율), `bondIntTcd`/`bondIntTcdNm`(이표채/할인채 구분), `intPayCyclCtt`(이자지급주기), `nxtmCopnDt`/`rbfCopnDt`(차기/직전 이표일), `bondIssuAmt`/`bondPymtAmt`/`bondBal`(발행/납입/잔액 금액), `grnDcd`/`grnDcdNm`(보증구분), `bondRnknDcd`/`bondRnknDcdNm`(채권순위), `txtnDcd`/`txtnDcdNm`(과세구분), `optnTcd`/`optnTcdNm`(옵션유형), 신용등급 4종(`kisScrsItmsKcdNm`/`kbpScrsItmsKcdNm`/`niceScrsItmsKcdNm`/`fnScrsItmsKcdNm`)

### ② 채권시세정보 — `GetBondSecuritiesInfoService`

- 베이스 URL: `https://apis.data.go.kr/1160100/service/GetBondSecuritiesInfoService` (경로에 `/service/` **있음** — ①과의 가장 흔한 실수 지점)
- 오퍼레이션: `getBondPriceInfo`
- 필수 파라미터 없음 (`serviceKey` 제외 모든 조회 파라미터가 옵션)
- 필터 접두사 규약: `begin*`(≥), `end*`(<), `like*`(포함), 접두사 없음(정확히 일치). **접두사 조합은 필드마다 다르다** — 임의로 일반화하지 말고 실재하는 20개 파라미터만 사용할 것(전체 목록은 `docs/api/bond-price-info.md`). 예: `srtnCd`는 `likeSrtnCd`만 존재(정확일치 없음), `mrktCtg`는 정확일치만 존재(`begin`/`end`/`like` 없음), `basDt`만 4종 접두사 전부 지원.
- `mrktCtg`(시장구분) 값: `KTS`(국채전문유통시장) / `일반채권` / `소액채권`
- 주요 응답 필드: `basDt`, `srtnCd`(9자리 단축코드), `isinCd`, `itmsNm`(종목명), `mrktCtg`, `clprPrc`/`clprVs`/`clprBnfRt`(종가·전일대비·수익률), `mkpPrc`/`mkpBnfRt`(시가), `hiprPrc`/`hiprBnfRt`(고가), `loprPrc`/`loprBnfRt`(저가), `trqu`(거래량), `trPrc`(거래대금)
- `xpYrCnt`(만기년수), `itmsCtg`(지표/경과)는 **KTS 시장에서만** 채워진다.

### 라이선스 (공공누리)

- **채권기본정보**: 공공누리 제2유형 — 출처표시 + **상업적 이용금지**. 상업적으로 활용하려면 데이터 원천 소유자인 한국예탁결제원(KSD)과 별도 정보이용계약이 필요 (portal@ksd.or.kr).
- **채권시세정보**: 이용허락범위 제한 없음.
- 서비스를 공개/수익화할 경우 기본정보 쪽 라이선스 제약을 먼저 확인할 것.

## Conventions

- 패키지 매니저: **pnpm** 전용 (npm/yarn 사용 금지)
- TypeScript strict 모드 적용 (`tsconfig.json`)
- 포매팅은 **Prettier**로 관리. `.prettierignore`에 `*.md`가 포함되어 있어 마크다운 문서는 Prettier 대상이 아니다.
- shadcn/ui 컴포넌트 추가: `pnpm dlx shadcn@latest add <component>`
- 테스트 파일: `tests/` 디렉터리 (`src/` 내부 아님)
- Tailwind v4: `@tailwindcss/vite` Vite 플러그인 방식 (PostCSS 아님)
- Node 버전 고정: `.node-version` 24.18.0 (`engines`: `^22.12.0 || ^24.11.0`)
- `.mcp.json`에 Cloudflare Docs, Astro Docs, Playwright MCP 서버가 등록되어 있다.
