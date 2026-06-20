# 多页重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单页面太阳系搭建演示重构为 5 页面的科普教育站点（首页、搭建、探索太阳系、探索地月、关于）

**Architecture:** 渐进式改造（方案A）—— 保留 engine/stores 层，新增 react-router，拆分渲染层为 canvas2d 和 threejs，组件按页面重组。分 4 个 Phase 实施。

**Tech Stack:** React 19 + TypeScript 6 + react-router-dom + Canvas 2D + Three.js + Zustand + Vite

**Spec:** `docs/specs/2026-06-20-multi-page-redesign.md`

---

## File Structure Plan

```
src/
├── main.tsx                    # 修改：包裹 BrowserRouter
├── App.tsx                     # 重写：路由容器 + TopNav
├── App.css                     # 修改：全局样式 + CSS 变量
│
├── pages/                      # 新建
│   ├── HomePage.tsx
│   ├── HomePage.css
│   ├── BuilderPage.tsx
│   ├── BuilderPage.css
│   ├── ExplorePage.tsx
│   ├── ExplorePage.css
│   ├── EarthMoonPage.tsx
│   ├── EarthMoonPage.css
│   ├── AboutPage.tsx
│   └── AboutPage.css
│
├── components/
│   ├── layout/                 # 新建
│   │   ├── TopNav.tsx
│   │   └── TopNav.css
│   ├── builder/                # 重组（从 toolbar/canvas/controls/history 迁移）
│   │   ├── BuilderCanvas.tsx   # 重写为 Canvas 2D
│   │   ├── CelestialToolbar.tsx
│   │   ├── CelestialToolbar.css
│   │   ├── ControlPanel.tsx
│   │   ├── ControlPanel.css
│   │   ├── HistoryPanel.tsx
│   │   ├── HistoryPanel.css
│   │   ├── ScoreModal.tsx
│   │   ├── ScoreModal.css
│   │   ├── VelocityInputForm.tsx
│   │   ├── VelocityInputForm.css
│   │   ├── CoordinateDisplay.tsx
│   │   ├── CoordinateDisplay.css
│   │   ├── Ruler.tsx
│   │   ├── Ruler.css
│   │   ├── BodyStatusPanel.tsx
│   │   ├── BodyStatusPanel.css
│   │   ├── CloseApproachOverlay.tsx
│   │   └── CloseApproachOverlay.css
│   ├── explore/
│   │   ├── ExploreCanvas.tsx
│   │   ├── CameraControls.tsx
│   │   ├── CameraControls.css
│   │   ├── BodyInfoPanel.tsx
│   │   ├── BodyInfoPanel.css
│   │   └── TimeSlider.tsx
│   ├── earthmoon/
│   │   ├── EarthMoonCanvas.tsx
│   │   ├── MoonPhase.tsx
│   │   ├── MoonPhase.css
│   │   ├── EclipsePanel.tsx
│   │   ├── TimeSlider.tsx
│   │   └── SunDirectionIndicator.tsx
│   └── shared/
│       └── ErrorBoundary.tsx
│
├── rendering/
│   ├── canvas2d/               # 新建
│   │   ├── setup.ts
│   │   ├── bodies.ts
│   │   ├── grid.ts
│   │   └── interaction.ts
│   └── threejs/                # 重组（从 rendering/ 迁移）
│       ├── setup.ts
│       ├── bodies.ts
│       ├── grid.ts
│       ├── interaction.ts
│       ├── cameraRef.ts
│       ├── touchInteraction.ts
│       └── trails.ts
│
├── engine/
│   ├── constants.ts            # 修改：新增 SIMPLIFIED_RADII，CELESTIAL_TEMPLATES 移除卫星
│   ├── physics.ts              # 修改：增加 dimension 参数
│   ├── scoring.ts              # 不变
│   ├── orbital.ts              # 不变
│   ├── autoBuild.ts            # 修改：移除卫星
│   ├── coordinateTransform.ts  # 修改：2D 恒等映射
│   └── eclipse.ts              # 新建
│
├── stores/
│   ├── buildStore.ts           # 不变
│   ├── uiStore.ts              # 修改：移除 3D 相关
│   ├── historyStore.ts         # 不变
│   ├── exploreStore.ts         # 新建
│   └── earthMoonStore.ts       # 新建
│
├── hooks/
│   ├── useKeyboardShortcuts.ts # 修改：仅在 /builder 生效
│   ├── useAudio.ts             # 不变
│   └── useRestore.ts           # 不变
│
└── persistence/
    └── repository.ts           # 不变
```

---

## Phase 1: 路由 + 导航栏 + 首页 + 关于页

### Task 1: 安装 react-router-dom 并创建入口路由

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx`
- Create: `src/pages/HomePage.tsx`
- Create: `src/pages/HomePage.css`
- Create: `src/pages/AboutPage.tsx`
- Create: `src/pages/AboutPage.css`
- Create: `src/pages/BuilderPage.tsx`
- Create: `src/pages/BuilderPage.css`
- Create: `src/pages/ExplorePage.tsx`
- Create: `src/pages/ExplorePage.css`
- Create: `src/pages/EarthMoonPage.tsx`
- Create: `src/pages/EarthMoonPage.css`

- [ ] **Step 1: 安装 react-router-dom**

```bash
npm install react-router-dom
```

- [ ] **Step 2: 创建占位页面组件**

Create `src/pages/HomePage.tsx`:
```tsx
import { Link } from 'react-router-dom';
import './HomePage.css';

function HomePage() {
  return (
    <div className="home-page">
      <div className="home-hero">
        <h1 className="home-title">☀ 太阳系探索</h1>
        <p className="home-subtitle">了解、搭建、探索我们的太阳系</p>
      </div>
      <div className="home-cards">
        <Link to="/builder" className="home-card">
          <div className="home-card-icon">🏗️</div>
          <h3>搭建太阳系</h3>
          <p>自由放置天体，设置初速度，模拟引力演化</p>
        </Link>
        <Link to="/explore" className="home-card">
          <div className="home-card-icon">🔭</div>
          <h3>探索太阳系</h3>
          <p>真实比例三维太阳系，自由旋转缩放查看</p>
        </Link>
        <Link to="/earth-moon" className="home-card">
          <div className="home-card-icon">🌍</div>
          <h3>探索地月系统</h3>
          <p>观察月球公转、月相变化与日食月食</p>
        </Link>
      </div>
      <p className="home-intro">
        太阳系包含 1 颗恒星、8 大行星、数百颗卫星、无数小行星和彗星。
        在这里，你可以亲手搭建一个太阳系，也可以在三维空间中探索它的奥秘。
      </p>
    </div>
  );
}

export default HomePage;
```

Create `src/pages/HomePage.css`:
```css
.home-page {
  height: calc(100vh - var(--nav-height));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  overflow-y: auto;
}

.home-hero {
  text-align: center;
  margin-bottom: 48px;
}

.home-title {
  font-size: 2.8rem;
  color: var(--accent-gold);
  margin-bottom: 12px;
}

.home-subtitle {
  font-size: 1.2rem;
  color: var(--text-secondary);
}

.home-cards {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 48px;
}

.home-card {
  display: block;
  width: 280px;
  padding: 28px 24px;
  background: var(--bg-secondary);
  border: 1px solid #2a2a4a;
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-primary);
  transition: border-color 0.2s, transform 0.2s;
}

.home-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.home-card-icon {
  font-size: 2rem;
  margin-bottom: 12px;
}

.home-card h3 {
  font-size: 1.1rem;
  margin-bottom: 8px;
  color: var(--accent);
}

.home-card p {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.home-intro {
  max-width: 640px;
  text-align: center;
  color: var(--text-secondary);
  line-height: 1.7;
  font-size: 0.95rem;
}
```

Create `src/pages/AboutPage.tsx`:
```tsx
import './AboutPage.css';

function AboutPage() {
  return (
    <div className="about-page">
      <h1>关于「太阳系探索」</h1>
      <section>
        <h2>项目目的</h2>
        <p>「太阳系探索」是一个交互式太阳系科普教育平台，旨在帮助用户通过动手搭建和三维探索来了解太阳系的结构、天体运动规律和引力物理。</p>
      </section>
      <section>
        <h2>技术栈</h2>
        <p>React 19 + TypeScript 6 + Three.js（三维渲染）+ Canvas 2D（二维渲染）+ Vite + Zustand（状态管理）</p>
      </section>
      <section>
        <h2>页面功能</h2>
        <ul>
          <li><strong>搭建太阳系</strong> — 二维自由搭建，N体引力模拟，评分挑战</li>
          <li><strong>探索太阳系</strong> — 三维真实比例太阳系，自由旋转缩放</li>
          <li><strong>探索地月系统</strong> — 地球-月球-太阳系统，月相与日食月食模拟</li>
        </ul>
      </section>
      <section>
        <h2>数据来源</h2>
        <p>天体物理数据参考 NASA 喷气推进实验室（JPL）行星历表数据近似值。</p>
      </section>
    </div>
  );
}

export default AboutPage;
```

Create `src/pages/AboutPage.css`:
```css
.about-page {
  height: calc(100vh - var(--nav-height));
  overflow-y: auto;
  padding: 40px;
  max-width: 720px;
  margin: 0 auto;
}

.about-page h1 {
  font-size: 1.8rem;
  color: var(--accent-gold);
  margin-bottom: 32px;
}

.about-page section {
  margin-bottom: 28px;
}

.about-page h2 {
  font-size: 1.1rem;
  color: var(--accent);
  margin-bottom: 8px;
}

.about-page p,
.about-page li {
  color: var(--text-secondary);
  line-height: 1.7;
  font-size: 0.95rem;
}

.about-page ul {
  padding-left: 20px;
}

.about-page li {
  margin-bottom: 6px;
}
```

Create `src/pages/BuilderPage.tsx`:
```tsx
import './BuilderPage.css';

function BuilderPage() {
  return (
    <div className="builder-page">
      <div className="builder-placeholder">
        <p>搭建页面 — 重构中</p>
      </div>
    </div>
  );
}

export default BuilderPage;
```

Create `src/pages/BuilderPage.css`:
```css
.builder-page {
  height: calc(100vh - var(--nav-height));
  display: flex;
}

.builder-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 1.1rem;
}
```

Create `src/pages/ExplorePage.tsx`:
```tsx
import './ExplorePage.css';

function ExplorePage() {
  return (
    <div className="explore-page">
      <div className="explore-placeholder">
        <p>探索太阳系 — 重构中</p>
      </div>
    </div>
  );
}

export default ExplorePage;
```

Create `src/pages/ExplorePage.css`:
```css
.explore-page {
  height: calc(100vh - var(--nav-height));
  display: flex;
  background: #000;
}

.explore-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 1.1rem;
}
```

Create `src/pages/EarthMoonPage.tsx`:
```tsx
import './EarthMoonPage.css';

function EarthMoonPage() {
  return (
    <div className="earthmoon-page">
      <div className="earthmoon-placeholder">
        <p>探索地月系统 — 重构中</p>
      </div>
    </div>
  );
}

export default EarthMoonPage;
```

Create `src/pages/EarthMoonPage.css`:
```css
.earthmoon-page {
  height: calc(100vh - var(--nav-height));
  display: flex;
  background: #000;
}

.earthmoon-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 1.1rem;
}
```

- [ ] **Step 3: 修改 main.tsx 添加 BrowserRouter**

Replace `src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 4: 验证构建**

```bash
npm run build
```

Expected: 构建成功（所有页面都是占位符，不会报错）

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/pages/
git commit -m "feat: add react-router-dom, create page placeholders and routing skeleton"
```

---

### Task 2: 创建导航栏组件 TopNav

**Files:**
- Create: `src/components/layout/TopNav.tsx`
- Create: `src/components/layout/TopNav.css`
- Modify: `src/App.css`（添加 CSS 变量）
- Modify: `src/App.tsx`

- [ ] **Step 1: 添加 CSS 变量到 App.css**

Replace `src/App.css`:
```css
:root {
  --nav-height: 52px;
  --bg-primary: #0a0a1a;
  --bg-secondary: #1a1a2e;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --accent: #4fc3f7;
  --accent-gold: #ffd54f;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

- [ ] **Step 2: 创建 TopNav 组件**

Create `src/components/layout/TopNav.tsx`:
```tsx
import { NavLink } from 'react-router-dom';
import './TopNav.css';

function TopNav() {
  return (
    <nav className="top-nav">
      <div className="top-nav-brand">
        <span className="top-nav-logo">☀</span>
        <span className="top-nav-title">太阳系探索</span>
      </div>
      <ul className="top-nav-links">
        <li>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            首页
          </NavLink>
        </li>
        <li>
          <NavLink to="/builder" className={({ isActive }) => isActive ? 'active' : ''}>
            搭建太阳系
          </NavLink>
        </li>
        <li>
          <NavLink to="/explore" className={({ isActive }) => isActive ? 'active' : ''}>
            探索太阳系
          </NavLink>
        </li>
        <li>
          <NavLink to="/earth-moon" className={({ isActive }) => isActive ? 'active' : ''}>
            探索地月系统
          </NavLink>
        </li>
        <li>
          <NavLink to="/about" className={({ isActive }) => isActive ? 'active' : ''}>
            关于
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default TopNav;
```

Create `src/components/layout/TopNav.css`:
```css
.top-nav {
  height: var(--nav-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid #2a2a4a;
  position: relative;
  z-index: 100;
}

.top-nav-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-nav-logo {
  font-size: 1.4rem;
}

.top-nav-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--accent-gold);
}

.top-nav-links {
  display: flex;
  list-style: none;
  gap: 4px;
}

.top-nav-links a {
  display: block;
  padding: 6px 14px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  transition: color 0.2s, background-color 0.2s;
}

.top-nav-links a:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.top-nav-links a.active {
  color: var(--accent);
  background: rgba(79, 195, 247, 0.1);
}
```

- [ ] **Step 3: 重写 App.tsx 为路由容器**

Replace `src/App.tsx`:
```tsx
import { Routes, Route } from 'react-router-dom';
import TopNav from './components/layout/TopNav';
import HomePage from './pages/HomePage';
import BuilderPage from './pages/BuilderPage';
import ExplorePage from './pages/ExplorePage';
import EarthMoonPage from './pages/EarthMoonPage';
import AboutPage from './pages/AboutPage';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <TopNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/builder" element={<BuilderPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/earth-moon" element={<EarthMoonPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
```

- [ ] **Step 4: 迁移 ErrorBoundary 到 shared**

```bash
mkdir -p src/components/shared
```

Move `src/components/ErrorBoundary.tsx` to `src/components/shared/ErrorBoundary.tsx` and update its import. Read the existing file first.

Check the existing ErrorBoundary export — if it uses `export default`, change to named export `export { ErrorBoundary }`. The existing file is at `src/components/ErrorBoundary.tsx`, create the new file at `src/components/shared/ErrorBoundary.tsx` with the same content but with named export:

Create `src/components/shared/ErrorBoundary.tsx`:
```tsx
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a1a',
          color: '#ff6b6b',
          gap: '12px',
          padding: '20px',
        }}>
          <h2>程序出错了</h2>
          <p style={{ color: '#a0a0a0', maxWidth: '500px', textAlign: 'center' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              border: '1px solid #4fc3f7',
              borderRadius: '6px',
              background: 'transparent',
              color: '#4fc3f7',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 5: 验证构建**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 6: 验证开发服务器**

```bash
npm run dev
```

Expected: 浏览器打开，顶部导航栏可见，点击各菜单可跳转到对应占位页面。

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.css src/components/layout/ src/components/shared/
git commit -m "feat: add TopNav component, CSS variables, ErrorBoundary migration"
```

---

## Phase 2: 搭建页面 Canvas 2D + 组件迁移

Phase 2 是最复杂的部分，需要：
1. 修改 engine 层支持 2D 模式
2. 创建 Canvas 2D 渲染层
3. 迁移所有搭建组件到 `components/builder/`
4. 组装 BuilderPage

### Task 3: 修改 engine/constants.ts — 新增简化半径表，精简模板

**Files:**
- Modify: `src/engine/constants.ts`

- [ ] **Step 1: 在 REAL_DATA 之后添加 SIMPLIFIED_RADII 常量**

Read the existing `src/engine/constants.ts` to find the section where `CELESTIAL_TEMPLATES` begins.

After the `REAL_DATA` definition (approximately line 356), before `CELESTIAL_TEMPLATES`, add:

```typescript
export const SIMPLIFIED_RADII: Record<string, number> = {
  sun: 40,
  jupiter: 25,
  saturn: 22,
  uranus: 18,
  neptune: 18,
  earth: 14,
  venus: 13,
  mars: 11,
  mercury: 9,
};
```

- [ ] **Step 2: 精简 CELESTIAL_TEMPLATES，移除所有卫星**

使用 `grep` 查找 `CELESTIAL_TEMPLATES` 在 constants.ts 中的起始和结束位置，然后替换为仅包含 1 恒星 + 8 行星的版本。

Use bash to find the exact lines:
```bash
grep -n "CELESTIAL_TEMPLATES" src/engine/constants.ts
grep -n "moon\|io\|europa\|ganymede\|callisto\|titan\|triton\|phobos\|deimos\|moon_titan" src/engine/constants.ts | head -20
```

Then edit `src/engine/constants.ts` to replace `CELESTIAL_TEMPLATES` definition. The new definition contains only 9 entries (sun + 8 planets), removing all moon entries. Keep the existing structure but drop `moon`, `io`, `europa`, `ganymede`, `callisto`, `titan`, `triton`, `phobos`, `deimos` entries.

The new `CELESTIAL_TEMPLATES` starts with:
```typescript
export const CELESTIAL_TEMPLATES: CelestialBodyTemplate[] = [
  {
    id: 'sun',
    name: '太阳',
    type: 'star',
    mass: REAL_DATA.sun.mass,
    radius: SIMPLIFIED_RADII.sun,
    textureUrl: '/textures/sun.jpg',
  },
  {
    id: 'mercury',
    name: '水星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.mercury.mass,
    radius: SIMPLIFIED_RADII.mercury,
    textureUrl: '/textures/mercury.jpg',
    semiMajorAxis: REAL_DATA.mercury.semiMajorAxis,
    orbitalSpeed: REAL_DATA.mercury.orbitalSpeed,
  },
  {
    id: 'venus',
    name: '金星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.venus.mass,
    radius: SIMPLIFIED_RADII.venus,
    textureUrl: '/textures/venus.jpg',
    semiMajorAxis: REAL_DATA.venus.semiMajorAxis,
    orbitalSpeed: REAL_DATA.venus.orbitalSpeed,
  },
  {
    id: 'earth',
    name: '地球',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.earth.mass,
    radius: SIMPLIFIED_RADII.earth,
    textureUrl: '/textures/earth.jpg',
    semiMajorAxis: REAL_DATA.earth.semiMajorAxis,
    orbitalSpeed: REAL_DATA.earth.orbitalSpeed,
  },
  {
    id: 'mars',
    name: '火星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.mars.mass,
    radius: SIMPLIFIED_RADII.mars,
    textureUrl: '/textures/mars.jpg',
    semiMajorAxis: REAL_DATA.mars.semiMajorAxis,
    orbitalSpeed: REAL_DATA.mars.orbitalSpeed,
  },
  {
    id: 'jupiter',
    name: '木星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.jupiter.mass,
    radius: SIMPLIFIED_RADII.jupiter,
    textureUrl: '/textures/jupiter.jpg',
    semiMajorAxis: REAL_DATA.jupiter.semiMajorAxis,
    orbitalSpeed: REAL_DATA.jupiter.orbitalSpeed,
  },
  {
    id: 'saturn',
    name: '土星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.saturn.mass,
    radius: SIMPLIFIED_RADII.saturn,
    textureUrl: '/textures/saturn.jpg',
    semiMajorAxis: REAL_DATA.saturn.semiMajorAxis,
    orbitalSpeed: REAL_DATA.saturn.orbitalSpeed,
  },
  {
    id: 'uranus',
    name: '天王星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.uranus.mass,
    radius: SIMPLIFIED_RADII.uranus,
    textureUrl: '/textures/uranus.jpg',
    semiMajorAxis: REAL_DATA.uranus.semiMajorAxis,
    orbitalSpeed: REAL_DATA.uranus.orbitalSpeed,
  },
  {
    id: 'neptune',
    name: '海王星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.neptune.mass,
    radius: SIMPLIFIED_RADII.neptune,
    textureUrl: '/textures/neptune.jpg',
    semiMajorAxis: REAL_DATA.neptune.semiMajorAxis,
    orbitalSpeed: REAL_DATA.neptune.orbitalSpeed,
  },
];
```

Since the exact current content of CELESTIAL_TEMPLATES is long, use a targeted edit approach — find the first occurrence of `export const CELESTIAL_TEMPLATES` and replace from there to the closing `];` of that array.

Read the current CELESTIAL_TEMPLATES section first using bash:
```bash
grep -n "export const CELESTIAL_TEMPLATES" src/engine/constants.ts
```

Then perform the edit by reading the exact content and replacing it.

- [ ] **Step 3: Commit**

```bash
git add src/engine/constants.ts
git commit -m "feat: add SIMPLIFIED_RADII, remove satellite templates from CELESTIAL_TEMPLATES"
```

---

### Task 4: 修改 physics.ts — 增加 2D 维度支持

**Files:**
- Modify: `src/engine/physics.ts`

- [ ] **Step 1: 修改 computeAccelerations 支持 2D**

Read the current file, then apply these changes.

In `computeAccelerations`, add `dimension: 2 | 3` parameter. When dimension is 2, ignore Z component:

```typescript
export function computeAccelerations(
  bodies: CelestialBody[],
  softening: number = PHYSICAL_CONSTANTS.softeningFactor,
  dimension: 2 | 3 = 3,
): [number, number, number][] {
  const n = bodies.length;
  const acc: [number, number, number][] = Array.from({ length: n }, () => [0, 0, 0]);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[i].position[0] - bodies[j].position[0];
      const dy = bodies[i].position[1] - bodies[j].position[1];
      const dz = dimension === 2 ? 0 : bodies[i].position[2] - bodies[j].position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const distSoft = Math.sqrt(dist * dist + softening * softening);
      const factor = PHYSICAL_CONSTANTS.G / (distSoft * distSoft * distSoft);

      const fx = -factor * bodies[j].mass * dx;
      const fy = -factor * bodies[j].mass * dy;
      const fz = dimension === 2 ? 0 : -factor * bodies[j].mass * dz;

      acc[i] = [acc[i][0] + fx, acc[i][1] + fy, acc[i][2] + fz];
      acc[j] = [acc[j][0] - fx, acc[j][1] - fy, acc[j][2] - fz];
    }
  }

  return acc;
}
```

- [ ] **Step 2: 修改 rk4Step 传递 dimension 参数**

```typescript
export function rk4Step(bodies: CelestialBody[], dt: number, dimension: 2 | 3 = 3): void {
  const n = bodies.length;

  const r0 = bodies.map(b => [...b.position] as [number, number, number]);
  const v0 = bodies.map(b => [...b.velocity] as [number, number, number]);

  const k1v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k1r = v0;

  for (let i = 0; i < n; i++) {
    bodies[i].position = [r0[i][0] + k1r[i][0] * dt / 2, r0[i][1] + k1r[i][1] * dt / 2, dimension === 2 ? 0 : r0[i][2] + k1r[i][2] * dt / 2];
    bodies[i].velocity = [v0[i][0] + k1v[i][0] * dt / 2, v0[i][1] + k1v[i][1] * dt / 2, dimension === 2 ? 0 : v0[i][2] + k1v[i][2] * dt / 2];
  }
  const k2v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k2r = bodies.map(b => [...b.velocity] as [number, number, number]);

  for (let i = 0; i < n; i++) {
    bodies[i].position = [r0[i][0] + k2r[i][0] * dt / 2, r0[i][1] + k2r[i][1] * dt / 2, dimension === 2 ? 0 : r0[i][2] + k2r[i][2] * dt / 2];
    bodies[i].velocity = [v0[i][0] + k2v[i][0] * dt / 2, v0[i][1] + k2v[i][1] * dt / 2, dimension === 2 ? 0 : v0[i][2] + k2v[i][2] * dt / 2];
  }
  const k3v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k3r = bodies.map(b => [...b.velocity] as [number, number, number]);

  for (let i = 0; i < n; i++) {
    bodies[i].position = [r0[i][0] + k3r[i][0] * dt, r0[i][1] + k3r[i][1] * dt, dimension === 2 ? 0 : r0[i][2] + k3r[i][2] * dt];
    bodies[i].velocity = [v0[i][0] + k3v[i][0] * dt, v0[i][1] + k3v[i][1] * dt, dimension === 2 ? 0 : v0[i][2] + k3v[i][2] * dt];
  }
  const k4v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k4r = bodies.map(b => [...b.velocity] as [number, number, number]);

  for (let i = 0; i < n; i++) {
    const dv: [number, number, number] = [
      (k1v[i][0] + 2 * k2v[i][0] + 2 * k3v[i][0] + k4v[i][0]) * dt / 6,
      (k1v[i][1] + 2 * k2v[i][1] + 2 * k3v[i][1] + k4v[i][1]) * dt / 6,
      dimension === 2 ? 0 : (k1v[i][2] + 2 * k2v[i][2] + 2 * k3v[i][2] + k4v[i][2]) * dt / 6,
    ];
    const dr: [number, number, number] = [
      (k1r[i][0] + 2 * k2r[i][0] + 2 * k3r[i][0] + k4r[i][0]) * dt / 6,
      (k1r[i][1] + 2 * k2r[i][1] + 2 * k3r[i][1] + k4r[i][1]) * dt / 6,
      dimension === 2 ? 0 : (k1r[i][2] + 2 * k2r[i][2] + 2 * k3r[i][2] + k4r[i][2]) * dt / 6,
    ];
    bodies[i].position = [r0[i][0] + dr[0], r0[i][1] + dr[1], dimension === 2 ? 0 : r0[i][2] + dr[2]];
    bodies[i].velocity = [v0[i][0] + dv[0], v0[i][1] + dv[1], dimension === 2 ? 0 : v0[i][2] + dv[2]];
  }
}
```

- [ ] **Step 3: 修改 detectCollisions 支持 2D**

```typescript
export function detectCollisions(bodies: CelestialBody[], dimension: 2 | 3 = 3): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const n = bodies.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[i].position[0] - bodies[j].position[0];
      const dy = bodies[i].position[1] - bodies[j].position[1];
      const dz = dimension === 2 ? 0 : bodies[i].position[2] - bodies[j].position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const rA = getBodyRadius(bodies[i].templateId);
      const rB = getBodyRadius(bodies[j].templateId);
      if (dist <= rA + rB) {
        const merged = mergeBodies(bodies[i], bodies[j], dimension);
        events.push({ bodyA: bodies[i], bodyB: bodies[j], mergedBody: merged });
      }
    }
  }

  return events;
}
```

- [ ] **Step 4: 修改 mergeBodies 支持 2D**

```typescript
function mergeBodies(a: CelestialBody, b: CelestialBody, dimension: 2 | 3 = 3): CelestialBody {
  const totalMass = a.mass + b.mass;
  const px = (a.position[0] * a.mass + b.position[0] * b.mass) / totalMass;
  const py = (a.position[1] * a.mass + b.position[1] * b.mass) / totalMass;
  const pz = dimension === 2 ? 0 : (a.position[2] * a.mass + b.position[2] * b.mass) / totalMass;
  const vx = (a.velocity[0] * a.mass + b.velocity[0] * b.mass) / totalMass;
  const vy = (a.velocity[1] * a.mass + b.velocity[1] * b.mass) / totalMass;
  const vz = dimension === 2 ? 0 : (a.velocity[2] * a.mass + b.velocity[2] * b.mass) / totalMass;

  return {
    id: `merged-${Date.now()}`,
    templateId: a.templateId,
    position: [px, py, pz],
    velocity: [vx, vy, vz],
    mass: totalMass,
    placedAt: Date.now(),
    rotationSpeed: 0,
    rotationPhase: 0,
  };
}
```

- [ ] **Step 5: 修改 advanceSimulation 传递 dimension**

```typescript
export function advanceSimulation(bodies: CelestialBody[], realDelta: number, timeScale: number, dimension: 2 | 3 = 3): number {
  if (bodies.length < 2) return 0;

  const simDelta = realDelta * timeScale;
  const steps = Math.min(
    Math.max(1, Math.floor(simDelta / SIM_CONFIG.timeStep)),
    SIM_CONFIG.maxSubsteps
  );
  const subDt = simDelta / steps;

  for (let s = 0; s < steps; s++) {
    rk4Step(bodies, subDt, dimension);
  }

  return simDelta;
}
```

- [ ] **Step 6: 验证类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add src/engine/physics.ts
git commit -m "feat: add 2D dimension support to physics engine"
```

---

### Task 5: 修改 autoBuild.ts — 移除卫星构建

**Files:**
- Modify: `src/engine/autoBuild.ts`

- [ ] **Step 1: 修改 AUTO_BUILD_TOTAL 和 computeAutoBuildPlan**

Change `AUTO_BUILD_TOTAL` from 17 to 9, and remove the moon construction loops from `computeAutoBuildPlan`.

Read the current file, then:

1. Change line: `export const AUTO_BUILD_TOTAL = 17;` → `export const AUTO_BUILD_TOTAL = 9;`

2. Remove the section after the 8 planets loop that builds moon states and moon plans (the part that iterates over `moonIds` arrays and builds moons). Keep only the Sun + 8 planets.

3. Remove the export of `planetStates` if it's not used elsewhere.

Since the celestial template list no longer has satellites, moons won't be placed by autoBuild. In the 2D builder, only 9 bodies exist.

Check what needs to change in the autoBuild function: find the moon section and remove it. Search for:
```bash
grep -n "moon\|卫星" src/engine/autoBuild.ts
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/autoBuild.ts
git commit -m "feat: remove satellite auto-build, reduce to 9 bodies (sun + 8 planets)"
```

---

### Task 6: 修改 coordinateTransform.ts — 2D 恒等映射

**Files:**
- Modify: `src/engine/coordinateTransform.ts`

- [ ] **Step 1: 添加 2D 模式支持**

Read the current file first. Then modify the `physicalToRender` and `renderToPhysical` functions to work as identity transforms when dimension is 2. The key change: add a module-level `let dimension: 2 | 3 = 3` variable and setter, and check it in transforms.

```typescript
let currentDimension: 2 | 3 = 3;

export function setDimension(d: 2 | 3) {
  currentDimension = d;
}
```

Modify `physicalToRender` and related functions to return identity for position when dimension === 2:
- In 2D mode: `physicalToRender(x, y, z) = (x, y, 0)` for position
- Size transform still uses `SIMPLIFIED_RADII` mapping (not physical radius)

Actually, in the 2D builder we won't use `coordinateTransform.ts` at all — the Canvas 2D layer handles 1:1 mapping directly. So the changes are minimal:

Add to the file:
```typescript
export { SIMPLIFIED_RADII } from './constants';
```

And add a `getSimplifiedRadius(templateId: string): number` function:
```typescript
import { SIMPLIFIED_RADII } from './constants';

export function getSimplifiedRadius(templateId: string): number {
  return SIMPLIFIED_RADII[templateId] ?? 5;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/coordinateTransform.ts
git commit -m "feat: add getSimplifiedRadius for 2D Canvas rendering"
```

---

### Task 7: 创建 Canvas 2D 渲染层

**Files:**
- Create: `src/rendering/canvas2d/setup.ts`
- Create: `src/rendering/canvas2d/bodies.ts`
- Create: `src/rendering/canvas2d/grid.ts`
- Create: `src/rendering/canvas2d/interaction.ts`

- [ ] **Step 1: Create setup.ts**

```typescript
export interface Canvas2DSetup {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export function createViewport(): Viewport {
  return { offsetX: 0, offsetY: 0, zoom: 1 };
}

export function initCanvas2D(container: HTMLElement): Canvas2DSetup {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  return { canvas, ctx };
}

export function applyViewport(ctx: CanvasRenderingContext2D, vp: Viewport, width: number, height: number) {
  ctx.setTransform(
    vp.zoom, 0, 0, vp.zoom,
    width / 2 + vp.offsetX * vp.zoom,
    height / 2 - vp.offsetY * vp.zoom,
  );
}

export function screenToPhysics(
  screenX: number,
  screenY: number,
  vp: Viewport,
  width: number,
  height: number,
): [number, number] {
  const physX = (screenX - width / 2) / vp.zoom - vp.offsetX;
  const physY = -(screenY - height / 2) / vp.zoom - vp.offsetY;
  return [physX, physY];
}
```

- [ ] **Step 2: Create bodies.ts**

```typescript
import type { CelestialBody } from '../../types';
import { getSimplifiedRadius } from '../../engine/coordinateTransform';

const BODY_COLORS: Record<string, string> = {
  sun: '#ffcc00',
  mercury: '#b0b0b0',
  venus: '#e8cda0',
  earth: '#4488ff',
  mars: '#cc6644',
  jupiter: '#d4b896',
  saturn: '#e8d5a3',
  uranus: '#88ccdd',
  neptune: '#4466ff',
};

export function drawBody(
  ctx: CanvasRenderingContext2D,
  body: CelestialBody,
  isSelected: boolean,
) {
  const r = getSimplifiedRadius(body.templateId);
  const color = BODY_COLORS[body.templateId] || '#888888';

  // Body circle with gradient
  const grad = ctx.createRadialGradient(
    body.position[0] - r * 0.25, body.position[1] - r * 0.25, r * 0.1,
    body.position[0], body.position[1], r,
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, '#000000');

  ctx.beginPath();
  ctx.arc(body.position[0], body.position[1], r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Selection ring
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(body.position[0], body.position[1], r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawPreviewCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  templateId: string,
) {
  const r = getSimplifiedRadius(templateId);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawVelocityArrow(
  ctx: CanvasRenderingContext2D,
  pos: [number, number, number],
  vel: [number, number, number],
) {
  const scale = 1e-4;
  const ex = pos[0] + vel[0] * scale;
  const ey = pos[1] + vel[1] * scale;
  const len = Math.sqrt((vel[0] * scale) ** 2 + (vel[1] * scale) ** 2);
  if (len < 2) return;

  ctx.beginPath();
  ctx.moveTo(pos[0], pos[1]);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = '#4caf50';
  ctx.lineWidth = 2;
  ctx.stroke();

  const angle = Math.atan2(ey - pos[1], ex - pos[0]);
  const arrowSize = 8;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(
    ex - arrowSize * Math.cos(angle - Math.PI / 6),
    ey - arrowSize * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    ex - arrowSize * Math.cos(angle + Math.PI / 6),
    ey - arrowSize * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fillStyle = '#4caf50';
  ctx.fill();
}

export function hitTestBody(
  mx: number,
  my: number,
  bodies: CelestialBody[],
): string | null {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const r = getSimplifiedRadius(bodies[i].templateId);
    const dx = mx - bodies[i].position[0];
    const dy = my - bodies[i].position[1];
    if (dx * dx + dy * dy <= r * r + 16) {
      return bodies[i].id;
    }
  }
  return null;
}
```

- [ ] **Step 3: Create grid.ts**

```typescript
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  vp: { offsetX: number; offsetY: number; zoom: number },
  width: number,
  height: number,
) {
  const [topLeftX, topLeftY] = screenToWorld(0, 0, vp, width, height);
  const [bottomRightX, bottomRightY] = screenToWorld(width, height, vp, width, height);

  const step = calcNiceStep(topLeftX, bottomRightX, width / 150);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;

  const startX = Math.floor(topLeftX / step) * step;
  for (let x = startX; x <= bottomRightX; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, topLeftY);
    ctx.lineTo(x, bottomRightY);
    ctx.stroke();
  }

  const startY = Math.floor(bottomRightY / step) * step;
  for (let y = startY; y <= topLeftY; y += step) {
    ctx.beginPath();
    ctx.moveTo(topLeftX, y);
    ctx.lineTo(bottomRightX, y);
    ctx.stroke();
  }
}

function calcNiceStep(min: number, max: number, targetLines: number): number {
  const range = max - min;
  const rough = range / targetLines;
  const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(rough))));
  const mant = rough / exp;
  if (mant < 1.5) return exp;
  if (mant < 3.5) return 2 * exp;
  if (mant < 7.5) return 5 * exp;
  return 10 * exp;
}

function screenToWorld(
  sx: number,
  sy: number,
  vp: { offsetX: number; offsetY: number; zoom: number },
  width: number,
  height: number,
): [number, number] {
  return [
    (sx - width / 2) / vp.zoom - vp.offsetX,
    -(sy - height / 2) / vp.zoom - vp.offsetY,
  ];
}

export function drawOrbitRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawGuideArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = 'rgba(255, 152, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}
```

- [ ] **Step 4: Create interaction.ts**

```typescript
import type { Viewport } from './setup';

export function canvasToPhysics(
  mx: number,
  my: number,
  vp: Viewport,
  width: number,
  height: number,
): [number, number] {
  return [
    (mx - width / 2) / vp.zoom - vp.offsetX,
    -(my - height / 2) / vp.zoom - vp.offsetY,
  ];
}

export function handleWheel(
  e: WheelEvent,
  vp: Viewport,
  width: number,
  height: number,
): Viewport {
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  const worldX = (mouseX - width / 2) / vp.zoom - vp.offsetX;
  const worldY = -(mouseY - height / 2) / vp.zoom - vp.offsetY;

  const factor = e.deltaY > 0 ? 0.85 : 1.15;
  const newZoom = Math.max(0.1, Math.min(10, vp.zoom * factor));

  return {
    offsetX: (mouseX - width / 2) / newZoom - worldX,
    offsetY: -(mouseY - height / 2) / newZoom - worldY,
    zoom: newZoom,
  };
}

export function handleMouseDrag(
  e: MouseEvent,
  startX: number,
  startY: number,
  vp: Viewport,
  zoom: number,
): Viewport {
  return {
    offsetX: vp.offsetX + (e.clientX - startX) / zoom,
    offsetY: vp.offsetY - (e.clientY - startY) / zoom,
    zoom,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/rendering/canvas2d/
git commit -m "feat: create Canvas 2D rendering layer (setup, bodies, grid, interaction)"
```

---

### Task 8: 迁移搭建页组件到 components/builder/

**Files:**
- Move: `src/components/toolbar/CelestialToolbar.tsx` → `src/components/builder/CelestialToolbar.tsx`
- Move: `src/components/toolbar/CelestialToolbar.css` → `src/components/builder/CelestialToolbar.css`
- Move: `src/components/controls/ControlPanel.tsx` → `src/components/builder/ControlPanel.tsx`
- Move: `src/components/controls/ControlPanel.css` → `src/components/builder/ControlPanel.css`
- Move: `src/components/controls/ScoreModal.tsx` → `src/components/builder/ScoreModal.tsx`
- Move: `src/components/controls/ScoreModal.css` → `src/components/builder/ScoreModal.css`
- Move: `src/components/controls/VelocityInputForm.tsx` → `src/components/builder/VelocityInputForm.tsx`
- Move: `src/components/controls/VelocityInputForm.css` → `src/components/builder/VelocityInputForm.css`
- Move: `src/components/history/HistoryPanel.tsx` → `src/components/builder/HistoryPanel.tsx`
- Move: `src/components/history/HistoryPanel.css` → `src/components/builder/HistoryPanel.css`
- Move: `src/components/CoordinateDisplay.tsx` → `src/components/builder/CoordinateDisplay.tsx`
- Move: `src/components/CoordinateDisplay.css` → `src/components/builder/CoordinateDisplay.css`
- Move: `src/components/canvas/BodyStatusPanel.tsx` → `src/components/builder/BodyStatusPanel.tsx`
- Move: `src/components/canvas/BodyStatusPanel.css` → `src/components/builder/BodyStatusPanel.css`
- Move: `src/components/canvas/Ruler.tsx` → `src/components/builder/Ruler.tsx`
- Move: `src/components/canvas/Ruler.css` → `src/components/builder/Ruler.css`
- Move: `src/components/canvas/CloseApproachOverlay.tsx` → `src/components/builder/CloseApproachOverlay.tsx`
- Move: `src/components/canvas/CloseApproachOverlay.css` → `src/components/builder/CloseApproachOverlay.css`

- [ ] **Step 1: 创建目标目录并移动所有文件**

```bash
mkdir -p src/components/builder
mv src/components/toolbar/CelestialToolbar.tsx src/components/builder/CelestialToolbar.tsx
mv src/components/toolbar/CelestialToolbar.css src/components/builder/CelestialToolbar.css
mv src/components/controls/ControlPanel.tsx src/components/builder/ControlPanel.tsx
mv src/components/controls/ControlPanel.css src/components/builder/ControlPanel.css
mv src/components/controls/ScoreModal.tsx src/components/builder/ScoreModal.tsx
mv src/components/controls/ScoreModal.css src/components/builder/ScoreModal.css
mv src/components/controls/VelocityInputForm.tsx src/components/builder/VelocityInputForm.tsx
mv src/components/controls/VelocityInputForm.css src/components/builder/VelocityInputForm.css
mv src/components/history/HistoryPanel.tsx src/components/builder/HistoryPanel.tsx
mv src/components/history/HistoryPanel.css src/components/builder/HistoryPanel.css
mv src/components/CoordinateDisplay.tsx src/components/builder/CoordinateDisplay.tsx
mv src/components/CoordinateDisplay.css src/components/builder/CoordinateDisplay.css
mv src/components/canvas/BodyStatusPanel.tsx src/components/builder/BodyStatusPanel.tsx
mv src/components/canvas/BodyStatusPanel.css src/components/builder/BodyStatusPanel.css
mv src/components/canvas/Ruler.tsx src/components/builder/Ruler.tsx
mv src/components/canvas/Ruler.css src/components/builder/Ruler.css
mv src/components/canvas/CloseApproachOverlay.tsx src/components/builder/CloseApproachOverlay.tsx
mv src/components/canvas/CloseApproachOverlay.css src/components/builder/CloseApproachOverlay.css
```

- [ ] **Step 2: 更新所有被移动文件内部的 import 路径**

Files that reference other moved files need import path updates. Use `grep` to find cross-references:

```bash
grep -rn "from '\.\.\/" src/components/builder/ | grep -v ".css"
```

For each moved file, update relative imports to point to correct locations. The key changes:
- `../engine/` → `../../engine/`
- `../stores/` → `../../stores/`
- `../hooks/` → `../../hooks/`
- `../persistence/` → `../../persistence/`
- `../types` → `../../types`
- Cross-references within builder components: `./` (same directory)

- [ ] **Step 3: 验证类型检查**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any remaining import errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/builder/ src/components/toolbar/ src/components/controls/ src/components/history/ src/components/canvas/ src/components/CoordinateDisplay.tsx src/components/CoordinateDisplay.css
git commit -m "refactor: move builder components to components/builder/"
```

---

### Task 9: 创建 BuilderCanvas 组件（Canvas 2D 画布）

**Files:**
- Create: `src/components/builder/BuilderCanvas.tsx`
- Modify: `src/stores/buildStore.ts`（确保 advanceSimulation 传 dimension=2）
- Modify: `src/stores/uiStore.ts`（移除 3D 相关字段）

- [ ] **Step 1: 修改 buildStore.ts 让 advanceSimulation 传 dimension=2**

Read the existing `src/stores/buildStore.ts`. Find the `advanceSimulation` action. It currently calls `advanceSimulation(bodies, ...)`. Change to `advanceSimulation(bodies, realDelta, timeScale, 2)`.

- [ ] **Step 2: 修改 uiStore.ts 移除 3D 相关**

Remove fields: `observationTargetId`, `mouseRenderPos`, `mousePhysicalPos`, `clickPosRender`.
Keep: `mouseCanvasPos` → rename to `mousePos: [number, number] | null`.

- [ ] **Step 3: 创建 BuilderCanvas.tsx**

```tsx
import { useEffect, useRef, useCallback } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { advanceSimulation, detectCollisions } from '../../engine/physics';
import {
  initCanvas2D,
  createViewport,
  applyViewport,
  screenToPhysics,
  type Canvas2DSetup,
  type Viewport,
} from '../../rendering/canvas2d/setup';
import { drawBody, drawPreviewCircle, drawVelocityArrow, hitTestBody } from '../../rendering/canvas2d/bodies';
import { drawGrid, drawOrbitRing, drawGuideArrow } from '../../rendering/canvas2d/grid';
import { handleWheel, handleMouseDrag } from '../../rendering/canvas2d/interaction';

function BuilderCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<Canvas2DSetup | null>(null);
  const vpRef = useRef<Viewport>(createViewport());
  const dragRef = useRef<{ startX: number; startY: number; vp: Viewport } | null>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const bodies = useBuildStore(s => s.bodies);
  const isRunning = useBuildStore(s => s.isRunning);
  const timeScale = useBuildStore(s => s.timeScale);
  const selectedToolId = useUIStore(s => s.selectedToolId);
  const selectedBodyIds = useUIStore(s => s.selectedBodyIds);
  const isPlacing = useUIStore(s => s.isPlacing);
  const showHint = useUIStore(s => s.showHint);
  const setSelectedBodyIds = useUIStore(s => s.setSelectedBodyIds);
  const setMousePositions = useUIStore(s => s.setMousePositions);
  const previewPosition = useUIStore(s => s.previewPosition);

  const render = useCallback(() => {
    const setup = setupRef.current;
    const container = containerRef.current;
    if (!setup || !container) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const vp = vpRef.current;

    setup.ctx.clearRect(0, 0, w, h);

    // Background
    setup.ctx.fillStyle = '#050510';
    setup.ctx.fillRect(0, 0, w, h);

    applyViewport(setup.ctx, vp, w, h);

    // Grid
    drawGrid(setup.ctx, vp, w, h);

    // Bodies
    for (const body of bodies) {
      const isSelected = selectedBodyIds.includes(body.id);
      drawBody(setup.ctx, body, isSelected);
    }

    // Preview
    if (selectedToolId && previewPosition) {
      drawPreviewCircle(setup.ctx, previewPosition[0], previewPosition[1], selectedToolId);
    }

    // Hint
    if (showHint) {
      // Hint system will be wired in a later task
    }
  }, [bodies, selectedBodyIds, selectedToolId, previewPosition, showHint]);

  // Animation loop
  useEffect(() => {
    const loop = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;

      if (isRunning && dt > 0) {
        useBuildStore.getState().advanceSimulation(dt);
        const currentBodies = useBuildStore.getState().bodies;
        const collisions = detectCollisions(currentBodies, 2);
        if (collisions.length > 0) {
          for (const c of collisions) {
            const state = useBuildStore.getState();
            state.replaceCollidedBodies(c.bodyA.id, c.bodyB.id, c.mergedBody);
          }
        }
      }

      render();
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, render]);

  // Init
  useEffect(() => {
    if (!containerRef.current) return;
    setupRef.current = initCanvas2D(containerRef.current);
    return () => {
      const setup = setupRef.current;
      if (setup) {
        setup.canvas.remove();
        setupRef.current = null;
      }
    };
  }, []);

  // Mouse handlers
  const container = containerRef.current;
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const setup = setupRef.current;
    if (!setup) return;
    const rect = containerRef.current.getBoundingClientRect();
    const [px, py] = screenToPhysics(e.clientX - rect.left, e.clientY - rect.top, vpRef.current, rect.width, rect.height);
    setMousePositions([px, py]);
  }, [setMousePositions]);

  const handleWheelEvt = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    vpRef.current = handleWheel(e as unknown as WheelEvent, vpRef.current, rect.width, rect.height);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, vp: { ...vpRef.current } };
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', cursor: 'crosshair' }}
      onMouseMove={handleMouseMove}
      onWheel={handleWheelEvt}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onContextMenu={e => e.preventDefault()}
    />
  );
}

export default BuilderCanvas;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/builder/BuilderCanvas.tsx src/stores/buildStore.ts src/stores/uiStore.ts
git commit -m "feat: create BuilderCanvas component with Canvas 2D rendering"
```

---

### Task 10: 组装 BuilderPage

**Files:**
- Modify: `src/pages/BuilderPage.tsx`
- Modify: `src/pages/BuilderPage.css`

- [ ] **Step 1: 更新 BuilderPage.tsx 为完整布局**

Replace `src/pages/BuilderPage.tsx`:
```tsx
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import CelestialToolbar from '../components/builder/CelestialToolbar';
import BuilderCanvas from '../components/builder/BuilderCanvas';
import CoordinateDisplay from '../components/builder/CoordinateDisplay';
import BodyStatusPanel from '../components/builder/BodyStatusPanel';
import CloseApproachOverlay from '../components/builder/CloseApproachOverlay';
import ControlPanel from '../components/builder/ControlPanel';
import HistoryPanel from '../components/builder/HistoryPanel';
import ScoreModal from '../components/builder/ScoreModal';
import './BuilderPage.css';

function BuilderPage() {
  useKeyboardShortcuts();

  return (
    <div className="builder-page">
      <div className="builder-panel-left">
        <CelestialToolbar />
      </div>
      <div className="builder-panel-center">
        <div className="builder-canvas-wrapper">
          <BuilderCanvas />
        </div>
        <CoordinateDisplay />
        <CloseApproachOverlay />
        <BodyStatusPanel />
      </div>
      <div className="builder-panel-right">
        <ControlPanel />
        <HistoryPanel />
      </div>
      <ScoreModal />
    </div>
  );
}

export default BuilderPage;
```

- [ ] **Step 2: 更新 BuilderPage.css**

Replace `src/pages/BuilderPage.css`:
```css
.builder-page {
  height: calc(100vh - var(--nav-height));
  display: grid;
  grid-template-columns: 220px 1fr 280px;
  grid-template-rows: 1fr;
}

.builder-panel-left {
  background: #0d0d2a;
  border-right: 1px solid #1a1a3a;
  overflow-y: auto;
}

.builder-panel-center {
  position: relative;
  overflow: hidden;
  background: #050510;
  display: flex;
  flex-direction: column;
}

.builder-canvas-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
}

.builder-panel-right {
  background: #0d0d2a;
  border-left: 1px solid #1a1a3a;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 3: 验证构建**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/BuilderPage.tsx src/pages/BuilderPage.css
git commit -m "feat: assemble BuilderPage with Canvas 2D and all builder components"
```

---

## Phase 3: 探索太阳系页面

### Task 11: 重组 Three.js 渲染层到 rendering/threejs/

**Files:**
- Move: `src/rendering/*.ts` → `src/rendering/threejs/*.ts`

- [ ] **Step 1: 移动所有 rendering/ 文件到 rendering/threejs/**

```bash
mkdir -p src/rendering/threejs
mv src/rendering/setup.ts src/rendering/threejs/setup.ts
mv src/rendering/bodies.ts src/rendering/threejs/bodies.ts
mv src/rendering/grid.ts src/rendering/threejs/grid.ts
mv src/rendering/interaction.ts src/rendering/threejs/interaction.ts
mv src/rendering/cameraRef.ts src/rendering/threejs/cameraRef.ts
mv src/rendering/touchInteraction.ts src/rendering/threejs/touchInteraction.ts
mv src/rendering/trails.ts src/rendering/threejs/trails.ts
```

- [ ] **Step 2: 更新所有文件内部的 import 路径**

grep for `from '../` in the moved files and update to `from '../../` where needed:
- `from '../engine/` → `from '../../engine/`
- `from '../stores/` → `from '../../stores/`
- `from '../types'` → `from '../../types'`
- Cross-references within threejs: `from './`

```bash
grep -rn "from '\.\.\/" src/rendering/threejs/
```

Fix all paths.

- [ ] **Step 3: Commit**

```bash
git add src/rendering/threejs/ src/rendering/setup.ts src/rendering/bodies.ts src/rendering/grid.ts src/rendering/interaction.ts src/rendering/cameraRef.ts src/rendering/touchInteraction.ts src/rendering/trails.ts
git commit -m "refactor: move Three.js rendering to rendering/threejs/"
```

---

### Task 12: 创建 exploreStore

**Files:**
- Create: `src/stores/exploreStore.ts`

- [ ] **Step 1: Create exploreStore.ts**

```typescript
import { create } from 'zustand';

export interface ExploreState {
  simulatedTime: number;
  timeScale: number;
  isRunning: boolean;
  selectedBodyId: string | null;
  showTrails: boolean;
  trailLength: number;
  zoom: number;

  setSimulatedTime: (t: number) => void;
  setTimeScale: (s: number) => void;
  toggleRunning: () => void;
  setSelectedBodyId: (id: string | null) => void;
  setShowTrails: (show: boolean) => void;
  setTrailLength: (len: number) => void;
  setZoom: (z: number) => void;
  reset: () => void;
}

const initialState = {
  simulatedTime: Date.now(),
  timeScale: 86400,
  isRunning: true,
  selectedBodyId: null,
  showTrails: true,
  trailLength: 0.3,
  zoom: 1,
};

export const useExploreStore = create<ExploreState>((set) => ({
  ...initialState,

  setSimulatedTime: (t) => set({ simulatedTime: t }),
  setTimeScale: (s) => set({ timeScale: s }),
  toggleRunning: () => set(s => ({ isRunning: !s.isRunning })),
  setSelectedBodyId: (id) => set({ selectedBodyId: id }),
  setShowTrails: (show) => set({ showTrails: show }),
  setTrailLength: (len) => set({ trailLength: len }),
  setZoom: (z) => set({ zoom: z }),
  reset: () => set(initialState),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/exploreStore.ts
git commit -m "feat: create exploreStore for Explore solar system page"
```

---

### Task 13: 创建探索太阳系页面组件

**Files:**
- Create: `src/components/explore/ExploreCanvas.tsx`
- Create: `src/components/explore/BodyInfoPanel.tsx`
- Create: `src/components/explore/BodyInfoPanel.css`
- Create: `src/components/explore/TimeSlider.tsx`
- Move: `src/components/canvas/CameraControls.tsx` → `src/components/explore/CameraControls.tsx`
- Move: `src/components/canvas/CameraControls.css` → `src/components/explore/CameraControls.css`

- [ ] **Step 1: 移动 CameraControls**

```bash
mv src/components/canvas/CameraControls.tsx src/components/explore/CameraControls.tsx
mv src/components/canvas/CameraControls.css src/components/explore/CameraControls.css
```
Update imports inside CameraControls.tsx.

- [ ] **Step 2: 创建 ExploreCanvas.tsx**

```tsx
import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useExploreStore } from '../../stores/exploreStore';
import { initScene } from '../../rendering/threejs/setup';
import { createBodyMesh, updateBodyMeshes, clearAllMeshes } from '../../rendering/threejs/bodies';
import { createReferencePlane, createOrbitRing } from '../../rendering/threejs/grid';
import { initTouchInteraction, destroyTouchInteraction } from '../../rendering/threejs/touchInteraction';
import { setSharedCamera, setSharedCanvas, setSharedScene } from '../../rendering/threejs/cameraRef';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import type { CelestialBody } from '../../types';

const SCALE = 1 / 1.496e10; // 1 AU = 1 unit

function computeBodyPosition(templateId: string, jd: number): [number, number, number] | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return [sv.position[0] * SCALE, sv.position[1] * SCALE, sv.position[2] * SCALE];
}

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    bodyMeshes: Map<string, THREE.Object3D>;
  } | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x333355, 0.5);
    scene.add(ambientLight);
    const sunLight = new THREE.PointLight(0xffeedd, 2, 0, 0);
    scene.add(sunLight);

    const bodyMeshes = new Map<string, THREE.Object3D>();
    const allIds = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

    for (const id of allIds) {
      const data = REAL_DATA[id];
      if (!data) continue;
      const geom = new THREE.SphereGeometry(Math.log10(data.radius / 2.4397e6 + 1) * 0.8, 48, 48);
      const mat = new THREE.MeshStandardMaterial({
        color: data.type === 'star' ? 0xffcc00 : 0xcccccc,
        roughness: 0.7,
        metalness: 0.1,
      });

      // Load texture if available
      const textureUrl = `/textures/${id}.jpg`;
      const loader = new THREE.TextureLoader();
      loader.load(textureUrl, (tex) => { mat.map = tex; mat.needsUpdate = true; }, undefined, () => {});

      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      bodyMeshes.set(id, mesh);

      // Orbit ring
      if (data.semiMajorAxis && data.orbital) {
        const orbitGeom = new THREE.TorusGeometry(data.semiMajorAxis * SCALE, 0.005, 8, 256);
        const orbitMat = new THREE.MeshBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.3 });
        const orbit = new THREE.Mesh(orbitGeom, orbitMat);
        orbit.rotation.x = Math.PI / 2;
        orbit.rotation.z = data.orbital.inclination;
        scene.add(orbit);
      }
    }

    // Grid
    const gridHelper = new THREE.PolarGridHelper(6, 64, 48, 256, 0x222244, 0x222244);
    scene.add(gridHelper);

    // Stars
    const starsGeom = new THREE.BufferGeometry();
    const starsCount = 2000;
    const starsPositions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      starsPositions[i * 3] = (Math.random() - 0.5) * 20;
      starsPositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      starsPositions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.02 });
    const stars = new THREE.Points(starsGeom, starsMat);
    scene.add(stars);

    setSharedCamera(camera);
    setSharedScene(scene);

    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDragging = true;
        prevMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      const sensitivity = 0.005;
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * sensitivity);
      camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), -dy * sensitivity);
      camera.lookAt(0, 0, 0);
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = Math.abs(e.clientX - prevMouse.x);
      const dy = Math.abs(e.clientY - prevMouse.y);
      isDragging = false;
      if (dx < 3 && dy < 3) {
        // Click: raycast
        const rect = renderer.domElement.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
        const meshList = Array.from(bodyMeshes.values());
        const intersects = raycaster.intersectObjects(meshList, true);
        if (intersects.length > 0) {
          let obj = intersects[0].object;
          while (obj && !(obj instanceof THREE.Mesh && obj.geometry instanceof THREE.SphereGeometry)) {
            obj = obj.parent as THREE.Object3D;
          }
          if (obj && obj.parent) {
            for (const [id, m] of bodyMeshes) {
              if (m === obj || m === obj.parent) {
                useExploreStore.getState().setSelectedBodyId(id);
                break;
              }
            }
          }
        } else {
          useExploreStore.getState().setSelectedBodyId(null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const dir = camera.position.clone().normalize();
      const dist = camera.position.length();
      const newDist = Math.max(0.5, Math.min(15, dist * factor));
      camera.position.copy(dir.multiplyScalar(newDist));
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const store = useExploreStore.getState();
      if (store.isRunning && dt > 0) {
        const newTime = store.simulatedTime + dt * store.timeScale * 1000;
        store.setSimulatedTime(newTime);
      }

      const jd = julianDate(useExploreStore.getState().simulatedTime);
      for (const id of allIds) {
        const mesh = bodyMeshes.get(id);
        if (!mesh) continue;
        if (id === 'sun') {
          mesh.position.set(0, 0, 0);
        } else {
          const pos = computeBodyPosition(id, jd);
          if (pos) {
            mesh.position.set(pos[0], pos[2], -pos[1]);
          }
        }
      }

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    sceneRef.current = { scene, camera, renderer, bodyMeshes };

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
  );
}

export default ExploreCanvas;
```

- [ ] **Step 3: 创建 BodyInfoPanel.tsx**

```tsx
import { useExploreStore } from '../../stores/exploreStore';
import { REAL_DATA } from '../../engine/constants';
import './BodyInfoPanel.css';

function BodyInfoPanel() {
  const selectedBodyId = useExploreStore(s => s.selectedBodyId);

  if (!selectedBodyId) return null;

  const data = REAL_DATA[selectedBodyId];
  if (!data) return null;

  return (
    <div className="body-info-panel">
      <h3>{data.name}</h3>
      <div className="body-info-row">
        <span>类型</span><span>{data.type === 'star' ? '恒星' : data.type === 'planet' ? '行星' : '卫星'}</span>
      </div>
      <div className="body-info-row">
        <span>质量</span><span>{data.mass.toExponential(2)} kg</span>
      </div>
      <div className="body-info-row">
        <span>直径</span><span>{(data.radius * 2 / 1000).toLocaleString()} km</span>
      </div>
      {data.semiMajorAxis && (
        <div className="body-info-row">
          <span>轨道半长轴</span><span>{(data.semiMajorAxis / 1.496e11).toFixed(2)} AU</span>
        </div>
      )}
      {data.orbitalSpeed && (
        <div className="body-info-row">
          <span>轨道速度</span><span>{(data.orbitalSpeed / 1000).toFixed(1)} km/s</span>
        </div>
      )}
    </div>
  );
}

export default BodyInfoPanel;
```

Create `src/components/explore/BodyInfoPanel.css`:
```css
.body-info-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(13, 13, 42, 0.92);
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  padding: 14px 18px;
  min-width: 200px;
  z-index: 10;
}

.body-info-panel h3 {
  color: var(--accent);
  font-size: 1rem;
  margin-bottom: 10px;
}

.body-info-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.body-info-row span:last-child {
  color: var(--text-primary);
}
```

- [ ] **Step 4: 创建 TimeSlider.tsx**

```tsx
import { useExploreStore } from '../../stores/exploreStore';

function TimeSlider() {
  const isRunning = useExploreStore(s => s.isRunning);
  const timeScale = useExploreStore(s => s.timeScale);
  const simulatedTime = useExploreStore(s => s.simulatedTime);
  const toggleRunning = useExploreStore(s => s.toggleRunning);
  const setTimeScale = useExploreStore(s => s.setTimeScale);
  const setSimulatedTime = useExploreStore(s => s.setSimulatedTime);

  const speeds = [1, 86400, 864000, 8640000, 86400000];

  const date = new Date(simulatedTime);
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{
      height: '44px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '0 16px',
      background: 'rgba(13, 13, 42, 0.95)',
      borderTop: '1px solid #1a1a3a',
    }}>
      <button onClick={() => setSimulatedTime(simulatedTime - 864000000)} style={btnStyle}>◀◀ 10天</button>
      <button onClick={toggleRunning} style={btnStyle}>{isRunning ? '⏸' : '▶'}</button>
      <button onClick={() => setSimulatedTime(simulatedTime + 864000000)} style={btnStyle}>10天 ▶▶</button>
      <span style={{ color: '#a0a0a0', fontSize: '0.85rem', minWidth: '200px', textAlign: 'center' }}>
        {dateStr} UTC
      </span>
      <div style={{ flex: 1 }} />
      {speeds.map(s => (
        <button
          key={s}
          onClick={() => setTimeScale(s)}
          style={{
            ...btnStyle,
            background: timeScale === s ? 'rgba(79, 195, 247, 0.2)' : 'transparent',
            color: timeScale === s ? '#4fc3f7' : '#a0a0a0',
          }}
        >
          {s >= 86400 ? `${s / 86400}天/秒` : '1x'}
        </button>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #2a2a4a',
  borderRadius: '4px',
  background: 'transparent',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

export default TimeSlider;
```

- [ ] **Step 5: 组装 ExplorePage**

- [ ] **Step 6: Commit**

```bash
git add src/components/explore/ src/stores/exploreStore.ts src/pages/ExplorePage.tsx src/pages/ExplorePage.css
git commit -m "feat: create Explore solar system page with ExploreCanvas, BodyInfoPanel, TimeSlider"
```

---

## Phase 4: 探索地月系统页面

### Task 14: 创建 earthMoonStore 和 eclipse 引擎

**Files:**
- Create: `src/stores/earthMoonStore.ts`
- Create: `src/engine/eclipse.ts`

- [ ] **Step 1: 创建 eclipse.ts**

```typescript
import { REAL_DATA } from './constants';
import {
  julianDate,
  orbitalPeriod,
  meanAnomalyAtTime,
  solveKepler,
  trueAnomaly,
  stateVectors,
} from './orbital';

const MU_SUN = 1.32712440018e20;
const MU_EARTH = 3.986004418e14;

// Moon phase and eclipse calculations

export type MoonPhaseName =
  | '新月' | '蛾眉月' | '上弦月' | '盈凸月'
  | '满月' | '亏凸月' | '下弦月' | '残月';

export interface MoonPhase {
  name: MoonPhaseName;
  angle: number;       // radians, 0 = full moon
  illumination: number; // 0-1 fraction illuminated
}

export type EclipseType = 'none' | 'penumbral' | 'partial' | 'total';

export interface EclipseEvent {
  date: Date;
  type: EclipseType;
  peakJD: number;
}

export function getMoonPhase(
  sunDir: [number, number, number],
  earthToMoon: [number, number, number],
): MoonPhase {
  const lenSM = Math.sqrt(sunDir[0] ** 2 + sunDir[1] ** 2 + sunDir[2] ** 2);
  const lenEM = Math.sqrt(earthToMoon[0] ** 2 + earthToMoon[1] ** 2 + earthToMoon[2] ** 2);
  const dot = (sunDir[0] * earthToMoon[0] + sunDir[1] * earthToMoon[1] + sunDir[2] * earthToMoon[2]) / (lenSM * lenEM);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  const phases: { max: number; name: MoonPhaseName }[] = [
    { max: Math.PI / 8, name: '满月' },
    { max: 3 * Math.PI / 8, name: '亏凸月' },
    { max: 5 * Math.PI / 8, name: '下弦月' },
    { max: 7 * Math.PI / 8, name: '残月' },
    { max: 9 * Math.PI / 8, name: '新月' },
    { max: 11 * Math.PI / 8, name: '蛾眉月' },
    { max: 13 * Math.PI / 8, name: '上弦月' },
    { max: 2 * Math.PI, name: '盈凸月' },
  ];

  const name = phases.find(p => angle < p.max)?.name ?? '满月';
  const illumination = (1 - Math.cos(angle)) / 2;

  return { name, angle, illumination };
}

// Approximate eclipse detection using simplified geometry
export function getEclipseType(
  sunDir: [number, number, number],
  earthToMoon: [number, number, number],
  moonDist: number,
): EclipseType {
  const lenSM = Math.sqrt(sunDir[0] ** 2 + sunDir[1] ** 2 + sunDir[2] ** 2);
  const lenEM = Math.sqrt(earthToMoon[0] ** 2 + earthToMoon[1] ** 2 + earthToMoon[2] ** 2);
  const dot = (sunDir[0] * earthToMoon[0] + sunDir[1] * earthToMoon[1] + sunDir[2] * earthToMoon[2]) / (lenSM * lenEM);

  // Opposition check: dot close to 1 means sun and moon are opposite
  if (dot < 0.9995) return 'none';

  // Simplified: check if moon is within Earth's umbra
  const earthRadius = 6371;
  const sunRadius = 696340;
  const distSE = lenSM * (149597870.7 / lenSM);
  const umbraAngle = Math.atan2(sunRadius - earthRadius, distSE);
  const moonOffsetAngle = Math.abs(Math.PI - Math.acos(dot));
  const shadowRadius = earthRadius * Math.sin(umbraAngle) * moonDist;

  if (moonOffsetAngle * moonDist < shadowRadius * 0.3) return 'total';
  if (moonOffsetAngle * moonDist < shadowRadius * 0.7) return 'partial';
  if (moonOffsetAngle * moonDist < shadowRadius * 1.2) return 'penumbral';
  return 'none';
}

// Predict upcoming lunar eclipses (brute force search, checking every 2 hours for 1 year)
export function predictEclipses(startJD: number, count: number): EclipseEvent[] {
  const events: EclipseEvent[] = [];
  const jdStep = 2 / 24; // 2 hours in JD
  const maxJD = startJD + 400; // ~1 year
  const muSun = 1.32712440018e20;
  const muEarth = 3.986004418e14;
  const moonA = 384400000; // Moon semi-major axis in meters
  const moonE = 0.0549;
  const moonI = 0.0898; // 5.145 degrees in radians
  const moonOmega = 2.183; // approx ascending node
  const moonOmegaBar = 5.552; // approx argument of periapsis
  const moonEpoch = 2451545.0;

  for (let jd = startJD; jd < maxJD && events.length < count; jd += jdStep) {
    // Earth heliocentric position
    const earthData = REAL_DATA.earth;
    if (!earthData.orbital || !earthData.semiMajorAxis) continue;

    const earthPeriod = orbitalPeriod(earthData.semiMajorAxis, muSun);
    const earthM = meanAnomalyAtTime(earthData.orbital.meanAnomalyAtEpoch, earthPeriod, earthData.orbital.epoch, jd);
    const earthMmod = ((earthM % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const earthE = solveKepler(earthMmod, earthData.orbital.eccentricity);
    const earthNu = trueAnomaly(earthE, earthData.orbital.eccentricity);
    const earthSV = stateVectors(earthData.semiMajorAxis, earthData.orbital.eccentricity, earthData.orbital.inclination, earthData.orbital.longitudeAscendingNode, earthData.orbital.argumentOfPeriapsis, earthNu, muSun);

    // Moon geocentric position
    const moonPeriod = orbitalPeriod(moonA, muEarth);
    const moonM = meanAnomalyAtTime(0.529, moonPeriod, moonEpoch, jd);
    const moonMmod = ((moonM % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const moonEVal = solveKepler(moonMmod, moonE);
    const moonNu = trueAnomaly(moonEVal, moonE);
    const moonSV = stateVectors(moonA, moonE, moonI, moonOmega, moonOmegaBar, moonNu, muEarth);

    // Sun direction from Earth = negated Earth heliocentric position
    const sunDir: [number, number, number] = [-earthSV.position[0], -earthSV.position[1], -earthSV.position[2]];
    const moonDist = Math.sqrt(moonSV.position[0] ** 2 + moonSV.position[1] ** 2 + moonSV.position[2] ** 2);

    const eclipseType = getEclipseType(sunDir, moonSV.position, moonDist);
    if (eclipseType !== 'none') {
      // Avoid duplicates within 12 hours of last event
      const lastEvent = events[events.length - 1];
      if (!lastEvent || jd - lastEvent.peakJD > 0.5) {
        events.push({
          date: new Date((jd - 2440587.5) * 86400000),
          type: eclipseType,
          peakJD: jd,
        });
      }
    }
  }

  return events;
}
```

- [ ] **Step 2: 创建 earthMoonStore.ts**

```typescript
import { create } from 'zustand';
import type { MoonPhase, EclipseType, EclipseEvent } from '../engine/eclipse';

interface EarthMoonState {
  simulatedTime: number;
  timeScale: number;
  isRunning: boolean;
  selectedBodyId: string | null;
  moonPhase: MoonPhase | null;
  eclipseType: EclipseType;
  eclipseDates: EclipseEvent[];

  setSimulatedTime: (t: number) => void;
  setTimeScale: (s: number) => void;
  toggleRunning: () => void;
  setSelectedBodyId: (id: string | null) => void;
  setMoonPhase: (p: MoonPhase) => void;
  setEclipseType: (t: EclipseType) => void;
  setEclipseDates: (d: EclipseEvent[]) => void;
  reset: () => void;
}

const initialState = {
  simulatedTime: Date.now(),
  timeScale: 3600,
  isRunning: true,
  selectedBodyId: null,
  moonPhase: null as MoonPhase | null,
  eclipseType: 'none' as EclipseType,
  eclipseDates: [] as EclipseEvent[],
};

export const useEarthMoonStore = create<EarthMoonState>((set) => ({
  ...initialState,

  setSimulatedTime: (t) => set({ simulatedTime: t }),
  setTimeScale: (s) => set({ timeScale: s }),
  toggleRunning: () => set(s => ({ isRunning: !s.isRunning })),
  setSelectedBodyId: (id) => set({ selectedBodyId: id }),
  setMoonPhase: (p) => set({ moonPhase: p }),
  setEclipseType: (t) => set({ eclipseType: t }),
  setEclipseDates: (d) => set({ eclipseDates: d }),
  reset: () => set(initialState),
}));
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/eclipse.ts src/stores/earthMoonStore.ts
git commit -m "feat: create eclipse.ts engine and earthMoonStore"
```

---

### Task 15: 创建地月系统页面组件

**Files:**
- Create: `src/components/earthmoon/EarthMoonCanvas.tsx`
- Create: `src/components/earthmoon/MoonPhase.tsx`
- Create: `src/components/earthmoon/MoonPhase.css`
- Create: `src/components/earthmoon/EclipsePanel.tsx`
- Create: `src/components/earthmoon/SunDirectionIndicator.tsx`
- Create: `src/components/earthmoon/TimeSlider.tsx`

- [ ] **Step 1: 创建 SunDirectionIndicator.tsx**

```tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Props {
  scene: THREE.Scene;
  sunDirection: THREE.Vector3;
}

function SunDirectionIndicator({ scene, sunDirection }: Props) {
  const arrowsRef = useRef<THREE.Group>(new THREE.Group());

  useEffect(() => {
    const group = arrowsRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  useEffect(() => {
    const group = arrowsRef.current;
    group.clear();

    const dir = sunDirection.clone().normalize();
    const origin = dir.clone().multiplyScalar(-80);

    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        if (Math.abs(i) + Math.abs(j) > 3) continue;
        const offset = new THREE.Vector3(i * 4, j * 4, 0);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0).cross(dir).normalize(), Math.acos(dir.y));
        
        const length = 90;
        const color = 0xffd54f;
        const arrow = new THREE.ArrowHelper(dir, origin.clone().add(offset), length, color, 4, 2);
        group.add(arrow);
      }
    }
  }, [sunDirection]);

  return null;
}

export default SunDirectionIndicator;
```

- [ ] **Step 2: 创建 MoonPhase.tsx**

```tsx
import { useEarthMoonStore } from '../../stores/earthMoonStore';
import './MoonPhase.css';

const PHASE_ICONS: Record<string, string> = {
  '新月': '🌑',
  '蛾眉月': '🌒',
  '上弦月': '🌓',
  '盈凸月': '🌔',
  '满月': '🌕',
  '亏凸月': '🌖',
  '下弦月': '🌗',
  '残月': '🌘',
};

function MoonPhase() {
  const moonPhase = useEarthMoonStore(s => s.moonPhase);

  if (!moonPhase) return null;

  return (
    <div className="moon-phase-panel">
      <div className="moon-phase-icon">{PHASE_ICONS[moonPhase.name] || '🌕'}</div>
      <div className="moon-phase-name">{moonPhase.name}</div>
      <div className="moon-phase-angle">
        相位角: {((moonPhase.angle * 180) / Math.PI).toFixed(1)}°
      </div>
      <div className="moon-phase-illumination">
        照明率: {(moonPhase.illumination * 100).toFixed(0)}%
      </div>
    </div>
  );
}

export default MoonPhase;
```

Create `src/components/earthmoon/MoonPhase.css`:
```css
.moon-phase-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(13, 13, 42, 0.92);
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  padding: 14px 18px;
  text-align: center;
  min-width: 140px;
  z-index: 10;
}

.moon-phase-icon {
  font-size: 2.2rem;
  margin-bottom: 6px;
}

.moon-phase-name {
  color: var(--accent);
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.moon-phase-angle,
.moon-phase-illumination {
  font-size: 0.78rem;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: 创建 EclipsePanel.tsx**

```tsx
import { useEarthMoonStore } from '../../stores/earthMoonStore';
import type { EclipseType } from '../../engine/eclipse';

const TYPE_LABELS: Record<EclipseType, string> = {
  none: '无',
  penumbral: '半影月食',
  partial: '月偏食',
  total: '月全食',
};

const TYPE_COLORS: Record<EclipseType, string> = {
  none: '#a0a0a0',
  penumbral: '#8d9ec6',
  partial: '#c68d8d',
  total: '#c65858',
};

function EclipsePanel() {
  const eclipseType = useEarthMoonStore(s => s.eclipseType);
  const eclipseDates = useEarthMoonStore(s => s.eclipseDates);
  const setSimulatedTime = useEarthMoonStore(s => s.setSimulatedTime);

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      background: 'rgba(13, 13, 42, 0.92)',
      border: '1px solid #2a2a4a',
      borderRadius: 8,
      padding: '14px 18px',
      minWidth: 220,
      zIndex: 10,
    }}>
      <div style={{ color: '#4fc3f7', fontSize: '0.95rem', fontWeight: 600, marginBottom: 8 }}>
        月食状态
      </div>
      <div style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 4,
        background: TYPE_COLORS[eclipseType] + '22',
        color: TYPE_COLORS[eclipseType],
        fontSize: '0.85rem',
        fontWeight: 600,
        marginBottom: 12,
      }}>
        {TYPE_LABELS[eclipseType]}
      </div>

      {eclipseDates.length > 0 && (
        <>
          <div style={{ color: '#a0a0a0', fontSize: '0.8rem', marginBottom: 6 }}>
            近期月食预报
          </div>
          {eclipseDates.slice(0, 5).map((ev, i) => (
            <div
              key={i}
              onClick={() => setSimulatedTime(ev.peakJD * 86400000 - 2440587.5 * 86400000)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontSize: '0.8rem',
                color: '#c0c0c0',
                cursor: 'pointer',
                borderBottom: '1px solid #1a1a3a',
              }}
            >
              <span>{ev.date.toLocaleDateString('zh-CN')}</span>
              <span style={{ color: TYPE_COLORS[ev.type] }}>{TYPE_LABELS[ev.type]}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default EclipsePanel;
```

- [ ] **Step 4: 创建 TimeSlider.tsx（含 ±1月 跳转）**

```tsx
import { useEarthMoonStore } from '../../stores/earthMoonStore';

function TimeSlider() {
  const isRunning = useEarthMoonStore(s => s.isRunning);
  const timeScale = useEarthMoonStore(s => s.timeScale);
  const simulatedTime = useEarthMoonStore(s => s.simulatedTime);
  const toggleRunning = useEarthMoonStore(s => s.toggleRunning);
  const setTimeScale = useEarthMoonStore(s => s.setTimeScale);
  const setSimulatedTime = useEarthMoonStore(s => s.setSimulatedTime);

  const speeds = [1, 3600, 86400, 2592000, 86400000];
  const speedLabels = ['1x', '1h/s', '1天/秒', '1月/秒', '100天/秒'];

  const date = new Date(simulatedTime);
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{
      height: 44,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      background: 'rgba(13, 13, 42, 0.95)',
      borderTop: '1px solid #1a1a3a',
    }}>
      <button onClick={() => setSimulatedTime(simulatedTime - 30 * 86400000)} style={btnStyle}>◀◀ 1月</button>
      <button onClick={() => setSimulatedTime(simulatedTime - 86400000)} style={btnStyle}>◀ 1天</button>
      <button onClick={toggleRunning} style={btnStyle}>{isRunning ? '⏸' : '▶'}</button>
      <button onClick={() => setSimulatedTime(simulatedTime + 86400000)} style={btnStyle}>1天 ▶</button>
      <button onClick={() => setSimulatedTime(simulatedTime + 30 * 86400000)} style={btnStyle}>1月 ▶▶</button>
      <span style={{ color: '#a0a0a0', fontSize: '0.82rem', minWidth: 200, textAlign: 'center' }}>
        {dateStr} UTC
      </span>
      <div style={{ flex: 1 }} />
      {speeds.map((s, i) => (
        <button
          key={s}
          onClick={() => setTimeScale(s)}
          style={{
            ...btnStyle,
            background: timeScale === s ? 'rgba(79, 195, 247, 0.2)' : 'transparent',
            color: timeScale === s ? '#4fc3f7' : '#a0a0a0',
          }}
        >
          {speedLabels[i]}
        </button>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid #2a2a4a',
  borderRadius: 4,
  background: 'transparent',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: '0.75rem',
};

export default TimeSlider;
```

- [ ] **Step 5: 创建 EarthMoonCanvas.tsx**

```tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useEarthMoonStore } from '../../stores/earthMoonStore';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { getMoonPhase, getEclipseType, predictEclipses } from '../../engine/eclipse';
import SunDirectionIndicator from './SunDirectionIndicator';

const MU_EARTH = 3.986004418e14;
const MOON_SEMI_MAJOR = 384400000;
const MOON_ECC = 0.0549;
const MOON_INC = 0.0898;
const MOON_LAN = 2.183;
const MOON_AOP = 5.552;
const MOON_EPOCH_JD = 2451545.0;
const MOON_EPOCH_MA = 0.529;
const SCALE = 1 / 40000000;

function EarthMoonCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    earth: THREE.Mesh;
    moon: THREE.Mesh;
    dirLight: THREE.DirectionalLight;
    ambientLight: THREE.AmbientLight;
  } | null>(null);
  const sunDirRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 0, 0));

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000008);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.001, 500);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x111133, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 2.5);
    dirLight.position.set(100, 0, 0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    scene.add(dirLight);

    const earthGeom = new THREE.SphereGeometry(2, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1, color: 0xffffff });
    const loader = new THREE.TextureLoader();
    loader.load('/textures/earth.jpg', (tex) => { earthMat.map = tex; earthMat.needsUpdate = true; });
    const earth = new THREE.Mesh(earthGeom, earthMat);
    earth.receiveShadow = true;
    earth.rotation.z = 0.408;
    scene.add(earth);

    const moonGeom = new THREE.SphereGeometry(0.55, 48, 48);
    const moonMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05, color: 0xcccccc });
    loader.load('/textures/moon.jpg', (tex) => { moonMat.map = tex; moonMat.needsUpdate = true; });
    const moon = new THREE.Mesh(moonGeom, moonMat);
    moon.castShadow = true;
    moon.receiveShadow = true;
    scene.add(moon);

    const moonOrbitGeom = new THREE.TorusGeometry(MOON_SEMI_MAJOR * SCALE, 0.08, 16, 256);
    const moonOrbitMat = new THREE.MeshBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.3 });
    const moonOrbit = new THREE.Mesh(moonOrbitGeom, moonOrbitMat);
    scene.add(moonOrbit);

    const starsGeom = new THREE.BufferGeometry();
    const starCount = 1500;
    const starsPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 60 + Math.random() * 40;
      starsPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starsPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starsPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 });
    scene.add(new THREE.Points(starsGeom, starsMat));

    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.005);
        camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), -dy * 0.005);
        camera.lookAt(0, 0, 0);
        prevMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      const dx = Math.abs(e.clientX - prevMouse.x);
      const dy = Math.abs(e.clientY - prevMouse.y);
      if (dx < 3 && dy < 3) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
        const intersects = raycaster.intersectObjects([earth, moon]);
        if (intersects.length > 0) {
          const obj = intersects[0].object;
          useEarthMoonStore.getState().setSelectedBodyId(obj === earth ? 'earth' : 'moon');
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      const dir = camera.position.clone().normalize();
      const dist = camera.position.length();
      camera.position.copy(dir.multiplyScalar(Math.max(1, Math.min(60, dist * factor))));
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const store = useEarthMoonStore.getState();
      if (store.isRunning && dt > 0) {
        store.setSimulatedTime(store.simulatedTime + dt * store.timeScale * 1000);
      }

      const simTime = useEarthMoonStore.getState().simulatedTime;
      const jd = julianDate(simTime);

      // Earth's heliocentric position (negated = sun direction from Earth)
      const earthData = REAL_DATA.earth;
      if (earthData.orbital && earthData.semiMajorAxis) {
        const period = orbitalPeriod(earthData.semiMajorAxis, MU_SUN);
        const M = meanAnomalyAtTime(earthData.orbital.meanAnomalyAtEpoch, period, earthData.orbital.epoch, jd);
        const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const E = solveKepler(Mmod, earthData.orbital.eccentricity);
        const nu = trueAnomaly(E, earthData.orbital.eccentricity);
        const sv = stateVectors(earthData.semiMajorAxis, earthData.orbital.eccentricity, earthData.orbital.inclination, earthData.orbital.longitudeAscendingNode, earthData.orbital.argumentOfPeriapsis, nu, MU_SUN);

        const sunDir = new THREE.Vector3(-sv.position[0], sv.position[2], -sv.position[1]).normalize();
        sunDirRef.current = sunDir.clone();
        dirLight.position.copy(sunDir.clone().multiplyScalar(120));
        dirLight.lookAt(0, 0, 0);
      }

      // Moon position
      const moonPeriod = orbitalPeriod(MOON_SEMI_MAJOR, MU_EARTH);
      const moonM = meanAnomalyAtTime(MOON_EPOCH_MA, moonPeriod, MOON_EPOCH_JD, jd);
      const moonMmod = ((moonM % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const moonEVal = solveKepler(moonMmod, MOON_ECC);
      const moonNu = trueAnomaly(moonEVal, MOON_ECC);
      const moonSV = stateVectors(MOON_SEMI_MAJOR, MOON_ECC, MOON_INC, MOON_LAN, MOON_AOP, moonNu, MU_EARTH);

      moon.position.set(moonSV.position[0] * SCALE, moonSV.position[2] * SCALE, -moonSV.position[1] * SCALE);

      // Moon phase
      const earthToMoon: [number, number, number] = [moonSV.position[0], moonSV.position[1], moonSV.position[2]];
      const earthData2 = REAL_DATA.earth;
      let sunFromEarth: [number, number, number] = [1, 0, 0];
      if (earthData2.orbital && earthData2.semiMajorAxis) {
        const period = orbitalPeriod(earthData2.semiMajorAxis, MU_SUN);
        const M = meanAnomalyAtTime(earthData2.orbital.meanAnomalyAtEpoch, period, earthData2.orbital.epoch, jd);
        const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const E = solveKepler(Mmod, earthData2.orbital.eccentricity);
        const nu = trueAnomaly(E, earthData2.orbital.eccentricity);
        const sv = stateVectors(earthData2.semiMajorAxis, earthData2.orbital.eccentricity, earthData2.orbital.inclination, earthData2.orbital.longitudeAscendingNode, earthData2.orbital.argumentOfPeriapsis, nu, MU_SUN);
        sunFromEarth = [-sv.position[0], -sv.position[1], -sv.position[2]];
      }

      const phase = getMoonPhase(sunFromEarth, earthToMoon);
      const moonDist = Math.sqrt(earthToMoon[0] ** 2 + earthToMoon[1] ** 2 + earthToMoon[2] ** 2);
      const eclipse = getEclipseType(sunFromEarth, earthToMoon, moonDist);

      useEarthMoonStore.getState().setMoonPhase(phase);
      useEarthMoonStore.getState().setEclipseType(eclipse);

      // Eclipse visual effect on moon
      if (eclipse === 'total') {
        (moon.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x330000);
        (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
      } else if (eclipse === 'partial') {
        (moon.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x1a0000);
        (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4;
      } else {
        (moon.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x000000);
        (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      }

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    sceneRef.current = { scene, camera, renderer, earth, moon, dirLight, ambientLight };

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Compute eclipse predictions once on mount
  useEffect(() => {
    const jd = julianDate(Date.now());
    const eclipses = predictEclipses(jd, 10);
    useEarthMoonStore.getState().setEclipseDates(eclipses);
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {sceneRef.current && (
        <SunDirectionIndicator scene={sceneRef.current.scene} sunDirection={sunDirRef.current} />
      )}
    </div>
  );
}

export default EarthMoonCanvas;
```

- [ ] **Step 6: 组装 EarthMoonPage**

Replace `src/pages/EarthMoonPage.tsx`:
```tsx
import EarthMoonCanvas from '../components/earthmoon/EarthMoonCanvas';
import MoonPhase from '../components/earthmoon/MoonPhase';
import EclipsePanel from '../components/earthmoon/EclipsePanel';
import TimeSlider from '../components/earthmoon/TimeSlider';
import './EarthMoonPage.css';

function EarthMoonPage() {
  return (
    <div className="earthmoon-page">
      <div className="earthmoon-canvas-area">
        <EarthMoonCanvas />
        <MoonPhase />
        <EclipsePanel />
      </div>
      <TimeSlider />
    </div>
  );
}

export default EarthMoonPage;
```

Replace `src/pages/EarthMoonPage.css`:
```css
.earthmoon-page {
  height: calc(100vh - var(--nav-height));
  display: flex;
  flex-direction: column;
  background: #000;
}

.earthmoon-canvas-area {
  flex: 1;
  min-height: 0;
  position: relative;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/earthmoon/ src/pages/EarthMoonPage.tsx src/pages/EarthMoonPage.css
git commit -m "feat: create Earth-Moon system exploration page with moon phases and eclipses"
```

---

## Phase 5: 清理 & 最终验证

### Task 16: 清理旧文件和验证

**Files:**
- Delete: `src/components/canvas/Canvas3D.tsx`（被 BuilderCanvas 替代）
- Delete: `src/components/canvas/TrailDebugOverlay.tsx`
- Delete: `src/components/canvas/TrailDebugOverlay.css`
- Delete: Empty leftover directories

- [ ] **Step 1: 删除不再需要的文件**

```bash
rm -f src/components/canvas/Canvas3D.tsx src/components/canvas/TrailDebugOverlay.tsx src/components/canvas/TrailDebugOverlay.css
rmdir src/components/toolbar 2>/dev/null || true
rmdir src/components/controls 2>/dev/null || true
rmdir src/components/history 2>/dev/null || true
rmdir src/components/canvas 2>/dev/null || true
rmdir src/components/layout 2>/dev/null || true  # already has files
rmdir src/rendering 2>/dev/null || true  # already has canvas2d/ and threejs/
```

- [ ] **Step 2: 完整类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 完整构建**

```bash
npm run build
```

- [ ] **Step 4: 启动开发服务器验证所有页面**

```bash
npm run dev
```

验证每个页面可访问：
- `http://localhost:5173/` — 首页显示三个卡片
- `http://localhost:5173/builder` — 搭建页面显示三栏布局
- `http://localhost:5173/explore` — 探索太阳系页面
- `http://localhost:5173/earth-moon` — 探索地月系统页面
- `http://localhost:5173/about` — 关于页面

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: cleanup old files, final verification"
```

---

## 备注

- Task 8（组件迁移）需要仔细更新所有 import 路径，跨文件引用较多
- Task 9（BuilderCanvas）的 hint 系统、velocity input 集成需要在后续迭代中完善（当前已实现核心渲染和基本交互）
- 每个 Phase 完成后应该可以独立构建和运行
