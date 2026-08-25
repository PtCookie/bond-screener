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
- Claude Code 세션에서 `pnpm dev`/`pnpm exec wrangler`는 `.claude/settings.json`의 `sandbox.excludedCommands`에 등록돼 있어 **명령을 그 문자열 그대로(감싸지 않고) 실행해야** 샌드박스 밖에서 전체 호스트 권한으로 돈다. `timeout pnpm dev &`처럼 앞에 다른 명령을 붙이면 패턴이 안 맞아 그냥 샌드박스 안에서 실행되고, 그렇게 뜬 dev 서버는 프로세스 네임스페이스가 갈려서 이후 `pnpm dev stop`(언샌드박스 실행)으로도 못 찾고 못 죽인다 — 백그라운드로 띄울 때 특히 주의.
- D1 로컬 모드(`wrangler d1 execute --local`)는 `sandbox.network.allowLocalBinding: true`(같은 설정 파일)가 있어야 동작한다. 이미 켜져 있음 — 지우지 말 것.
- `scripts/backfill.mjs`/`scripts/build-snapshot.mjs`가 `execFileSync`로 spawn하는 `wrangler` 서브프로세스는 (예: `pnpm backfill apply ...`처럼) 최상위 Bash 명령이 `pnpm exec wrangler ...` 자체가 아닌 한 `sandbox.excludedCommands`에 매칭되지 않아 샌드박스 안에서 실행된다. wrangler가 기본으로 보내는 텔레메트리(`sparrow.cloudflare.com`) 호출이 샌드박스 네트워크 정책에 막혀 명령 전체가 조용히 실패하므로, 두 스크립트 모두 `scripts/lib/wrangler-config.mjs`의 `WRANGLER_ENV`(`WRANGLER_SEND_METRICS=false`)를 해당 `execFileSync` 호출의 `env`로 넘겨 텔레메트리 자체를 끈다 — 새 `execFileSync(..., "wrangler", ...)` 호출을 추가할 때도 이 `env`를 넘길 것.
- wrangler의 OAuth 로그인 토큰은 만료되면 자동 갱신을 시도하는데, non-interactive 환경(예약 작업/스크립트 실행)에서는 브라우저 재인증을 못 해 `wrangler whoami`/`d1 execute` 등이 "Not logged in. Your auth token has expired..." 로 실패한다. 이 경우 사용자가 인터랙티브 터미널에서 `wrangler login`을 다시 실행해야 하며, 예약 작업으로 완전히 자동화하려면 `CLOUDFLARE_API_TOKEN` 환경변수(OAuth 대신 API 토큰 인증)를 등록하는 방법을 검토할 것.

## Tech Stack

- **Astro v7** — 페이지 라우팅 및 정적/서버 렌더링 (`output: "server"`)
- **React 19** — Astro Islands로 인터랙티브 컴포넌트
- **shadcn/ui** (`@base-ui/react` 기반, Phosphor 아이콘) — UI 컴포넌트 라이브러리 (`src/components/ui/`)
- **Tailwind v4** — `@tailwindcss/vite` 플러그인
- **TanStack Query v5** (`@tanstack/react-query`) — 클라이언트 사이드 서버 상태 관리. `@tanstack/eslint-plugin-query`가 `eslint.config.ts`에 연결되어 있음. 의존성만 추가된 상태로 `src/`에 실제 사용처(`QueryClientProvider` 등)는 아직 없음 — 도입 시 이 문서의 데이터 페칭 패턴 절을 갱신할 것
- **Cloudflare Workers** — 배포 플랫폼. `@astrojs/cloudflare` 어댑터 이미 설정됨
- **Vitest** — 단위/통합 테스트
- **ESLint** / **Prettier** — 린팅 / 포매팅

## Architecture

### Astro + React Islands

`.astro` 파일은 서버에서 렌더링되고, 인터랙티브 기능이 필요한 컴포넌트에만 `client:*` 디렉티브로 React를 사용한다 (예: `<BondTable client:load />`).

### 데이터 페칭 패턴

오픈API 호출은 `src/lib/` 또는 `src/api/`에 분리한다. Astro 페이지에서 서버 사이드로 초기 데이터를 페칭한 뒤 React island에 props로 전달하는 패턴을 기본으로 한다.

### Cloudflare 배포

`@astrojs/cloudflare` 어댑터 사용, `astro.config.mjs`에서 `output: "server"` 설정 완료. `wrangler.jsonc`의 `main`은 어댑터 entrypoint가 아니라 커스텀 진입점 `src/worker.ts`를 가리킨다 — cron `scheduled` 핸들러(아래 "데이터 계층" 절)를 추가하기 위해서다. `src/worker.ts`는 `fetch`를 `@astrojs/cloudflare/handler`의 `handle`에 그대로 위임하므로 Astro 라우팅 동작은 이전과 동일하다. 시크릿(`serviceKey` 등)은 `Astro.locals.runtime.env` 또는 `import.meta.env`로 접근한다.
- **로컬 개발**(`pnpm dev`/`wrangler dev`): 프로젝트 루트에 `.dev.vars` 또는 `.env` 파일에 `KEY="VALUE"` 형식으로 넣는다. **둘 중 하나만 사용할 것** — `.dev.vars`가 존재하면 `.env`의 값은 무시된다. 오픈API 인증키는 `BOND_API_SERVICE_KEY`라는 이름으로 넣는다(`.claude/skills/probe-bond-api`가 이 이름을 찾는다).
- **배포**(`wrangler deploy`): `.dev.vars`/`.env`는 로컬 전용이라 배포된 Worker에는 전달되지 않는다. 반드시 `wrangler secret put <NAME>`으로 Cloudflare 플랫폼에 시크릿을 등록해야 하며, `wrangler deploy`는 그 등록된 값을 그대로 바인딩한다.
- `.dev.vars`, `.env`는 커밋 금지 (`.gitignore`에 `.dev.vars*`, `.env*` 패턴으로 등록됨).
- 바인딩 타입을 바꾼 뒤에는 `pnpm generate-types`로 `worker-configuration.d.ts`를 갱신한다.
- D1/R2 CLI 명령(`wrangler d1 execute`, `wrangler r2 object put` 등)은 항상 `--config ./wrangler.jsonc`를 명시할 것 — 빌드 산출물(`dist/server/wrangler.json`)로의 배포 리다이렉트와 혼동을 피하기 위함.

### 데이터 계층 (D1 + R2 + cron)

일일 호출 쿼터(개발계정 10,000건)와 시크릿 노출 문제 때문에 클라이언트가 오픈API를 직접 호출하지 않는다. `Client → Workers(cron) → data.go.kr` 구조로, Workers가 매일 데이터를 미리 긁어 D1에 저장하고 R2에 정적 스냅샷을 올리면 클라이언트는 R2 스냅샷만 받는다(D1 read 500만/일 한도 보호).

- **스키마**: `migrations/0001_init.sql`(`bond`/`bond_state`/`bond_price`/`code_label`/`sync_run`/`app_meta`). 인덱스는 `migrations/pending/0002_indexes.sql`에 별도 보관하다가 초기 백필 완료 후에만 적용한다(백필 중 인덱스가 있으면 D1 write가 2배로 잡힘).
- **fetch/정규화**: `src/lib/openapi/`(공통 클라이언트·오류 분류·`""`/`" "`/`"NULL"` 정규화), `src/lib/bond/`(컬럼 순서 정본 `columns.ts`, 매핑 `mappers.ts`, 변경 감지 지문 `fingerprint.ts`).
- **D1 접근**: `src/lib/d1/sql.ts`가 `json_each(?1)`로 파라미터 1개에 배열을 실어 쿼리 1개로 벌크 upsert하는 SQL을 생성한다(Worker의 "쿼리 50개/invocation", "bound parameter 100개/쿼리" 제한 우회). **`INSERT ... SELECT ... FROM json_each(?1) ON CONFLICT ...` 형태는 SQLite 파서가 "near 'DO': syntax error"를 내므로 반드시 `FROM` 절과 `ON CONFLICT` 사이에 `WHERE true` 더미절을 넣어야 한다** — `buildInsertSelect` 헬퍼가 이미 방어하고 있으니 새 upsert SQL을 추가할 때도 이 헬퍼를 거칠 것.
- **cron 파이프라인**: `src/worker.ts`의 `scheduled` → `src/lib/sync/tick.ts`(`runSyncTick`). **한 tick(1분 간격)에 정확히 페이지 1개만 처리한다** — Free tier CPU 10ms 예산 안에 들어가야 하므로(`src/lib/sync/config.ts`의 `ISSU_PAGE_SIZE=200` 근거). 여러 페이지를 한 invocation에서 루프 돌리지 말 것.
- **`sync_run.status`는 `done`과 `empty`를 구분한다.** 오픈API 갱신이 영업일+1일 오후 1시 이후라 cron이 먼저 조회하면 0건이 온다 — 이걸 `done`으로 마감하면 다음 tick이 그 basDt를 영영 재조회하지 않는다(실운영에서 실제 발생). `finishSyncRun`은 `totalCount===0`이면 `empty`로 마감하고, `planTick`은 `empty`를 미시작(`null`)과 동일하게 재시도 대상으로 본다.
- **D1은 `WITHOUT ROWID` 없는 TEXT PRIMARY KEY 테이블에서 write가 2배로 잡힌다** — SQLite가 암묵적 PK 인덱스를 따로 만들기 때문(실측: `bond` 테이블 29,079행 삽입 → 실제 58,158 write). 새 테이블을 추가할 때 PK가 TEXT면 `WITHOUT ROWID` 여부를 반드시 검토할 것.
- **`wrangler d1 execute --file`은 SQL statement 하나가 100,000 byte를 넘으면 `SQLITE_TOOBIG`으로 실패한다.** 벌크 INSERT는 행 개수가 아니라 바이트 예산으로 청크를 나눠야 한다 — `scripts/lib/sql-gen.mjs`의 `buildMultiValuesInsert`(테이블별 실제 write 배수를 `writeMultiplier`로 추적해 일일 write 예산도 함께 관리)가 이미 이렇게 되어 있으니 새 백필 SQL을 추가할 때도 이 헬퍼를 거칠 것.
- **테스트**: `astro.config.mjs`의 `isVitest` 분기 때문에 vitest에는 Cloudflare 런타임이 없다(위 "알려진 이슈" 참고). D1 의존 로직은 `tests/helpers/fake-d1.ts`(`node:sqlite` 기반 `D1Database` 어댑터, Node 24.18.0 내장)로 테스트한다.
- **초기 백필**: `pnpm backfill <subcommand>` (`scripts/backfill.mjs`). `scripts/lib/*.mjs`는 `src/lib/`의 정규화·매핑·지문 로직을 **plain JS로 중복 구현**한 것이다(스크립트가 `node scripts/backfill.mjs`로 바로 돌아야 해서 `@/` 경로 별칭을 쓰는 TS를 import할 수 없음) — **`src/lib/bond/fingerprint.ts`와 `scripts/lib/fingerprint.mjs`는 반드시 바이트 단위로 동일한 로직을 유지할 것.** 둘이 어긋나면 백필로 적재한 지문과 cron이 이후 계산하는 지문이 달라져 전 종목이 "변경됨"으로 오판된다(실제로 이 정합성이 깨진 채 배포될 뻔한 적이 있음 — 교차 검증 없이 한쪽만 고치지 말 것).
- **주간 스냅샷**: `pnpm snapshot` (`scripts/build-snapshot.mjs`). 29,087행 JSON 조립+gzip이 Worker Free tier CPU 예산을 훌쩍 넘겨 cron 안에서 할 수 없으므로 로컬/CI에서 주 1회 실행한다.

### 디렉터리 구조

```
docs/
  api/            # 오픈API 2종 명세 문서 (src/api/와 1:1 대응)
migrations/       # D1 스키마 마이그레이션 (pending/는 백필 완료 전까지 보류)
scripts/          # 초기 백필·스냅샷 빌드 CLI (Node ESM, 무의존성)
src/
  api/            # 오픈API 요청/응답 TypeScript 타입·상수 (와이어 포맷 그대로, 로직 없음)
  components/     # React 및 Astro 컴포넌트
    ui/           # shadcn/ui 컴포넌트 (자동 생성, 직접 수정 가능)
  layouts/        # Astro 레이아웃
  lib/
    openapi/      # 공통 fetch 클라이언트, 오류 분류, 값 정규화
    bond/          # 컬럼 순서 정본, 매핑, 변경 감지 지문
    d1/            # D1 바인딩 호출 (repo 계층), json_each SQL 생성
    sync/          # cron tick 오케스트레이션, 순수 스케줄링 로직
    r2/            # R2 키 네이밍, 아카이브, 시세 델타 스냅샷
    utils.ts       # 범용 유틸리티 (cn 등)
  pages/          # 파일 기반 라우팅
  worker.ts       # Workers 진입점 (fetch 위임 + scheduled)
```

`src/api/`에 두 API의 요청/응답 TypeScript 타입이, `docs/api/`에 전체 필드 명세 문서가 있다.

## 오픈API 명세

공공데이터포털 금융위원회 채권 오픈API 2종. **전체 필드·파라미터 명세는 [`docs/api/README.md`](./docs/api/README.md), [`docs/api/bond-issu-info.md`](./docs/api/bond-issu-info.md), [`docs/api/bond-price-info.md`](./docs/api/bond-price-info.md)를, 대응 타입은 `src/api/`를 참고.** 여기서는 요약만 다룬다.

정본은 세 곳이며 우선순위는 다음과 같다: ① `openapi.do` 페이지의 Swagger UI(응답 스키마·서비스 URL의 최신 정본, 단 요청 파라미터는 비어 있음) → ② 리포지터리 루트의 `GetBondIssuInfoService_V2.docx`/`GetBondSecuritiesInfoService.docx`(요청 파라미터의 유일한 정본) → ③ 카탈로그 `openapi.json`(`https://www.data.go.kr/catalog/15059592/openapi.json`, `.../15094784/openapi.json`)은 데이터셋 메타데이터일 뿐 파라미터·스키마는 없으므로 참고용으로만 사용.

### 공통 규약

- 인증: 쿼리스트링 `serviceKey` (공공데이터포털에서 발급받은 인증키, Decoded 값을 `URLSearchParams`에 넣을 것 — 이중 인코딩 주의)
- `resultType` 기본값은 **`xml`**. JSON 응답을 원하면 매 요청에 `resultType=json`을 명시해야 한다.
- **API 레벨 오류는 HTTP 200으로 응답한다.** 반드시 `response.header.resultCode === "00"`을 확인할 것. **단 GW 레벨 오류(`serviceKey` 누락·미등록·만료 등)는 HTTP 200이 아니며(401/403 등) `{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{...}}}` 형태의 별도 봉투로 온다** — Swagger·docx 미문서화, 실호출로 확인됨. 타입은 `src/api/common.ts`의 `OpenApiGatewayErrorResponse`, 상세는 `docs/api/README.md`의 "공통 응답 규약" 참고.
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
