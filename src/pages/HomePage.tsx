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
