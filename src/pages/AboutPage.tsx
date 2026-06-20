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
