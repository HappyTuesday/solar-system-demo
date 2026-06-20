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
