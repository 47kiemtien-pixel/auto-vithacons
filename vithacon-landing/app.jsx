// Import react hooks directly from global React object in CDN scope
const { useState, useEffect } = React;

// ----------------------------------------------------
// UI COMPONENTS
// ----------------------------------------------------

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'TRANG CHỦ', href: '#home' },
    { name: 'GIỚI THIỆU', href: '#about' },
    { name: 'DỊCH VỤ', href: '#services' },
    { name: 'DỰ ÁN', href: '#projects' },
    { name: 'QUY TRÌNH', href: '#workflow' },
    { name: 'TUYỂN DỤNG', href: '#recruitment' },
    { name: 'LIÊN HỆ', href: '#contact' }
  ];

  return (
    <header className={`header ${isScrolled ? 'scrolled' : ''}`}>
      <div className="container header-container">
        <a href="#" className="logo">
          VIỆT THÀNH
          <span>XÂY DỰNG & CƠ KHÍ</span>
        </a>

        {/* Desktop Nav */}
        <nav className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`}>
          {navLinks.map((link, idx) => (
            <a
              key={idx}
              href={link.href}
              className="nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.name}
            </a>
          ))}
          <a href="tel:0972524799" className="btn btn-secondary" style={{ marginLeft: '10px' }}>
            ☎ 0972 524 799
          </a>
        </nav>

        {/* Mobile Toggle */}
        <div className="mobile-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? '✕' : '☰'}
        </div>
      </div>
    </header>
  );
};

const Hero = () => {
  return (
    <section id="home" className="hero">
      <div className="container">
        <div className="hero-content">
          <h1 className="hero-title">
            Giải Pháp Thi Công <br /><span>Kết Cấu Thép & Xây Dựng</span>
          </h1>
          <p className="hero-text">
            Tự hào là đơn vị uy tín hàng đầu trong lĩnh vực thiết kế và thi công nhà tiền chế chuyên nghiệp. Chất lượng vượt trội - Tối ưu chi phí - Tiến độ đảm bảo.
          </p>
          <div className="hero-actions">
            <a href="#services" className="btn btn-secondary">Khám Phá Dịch Vụ</a>
            <a href="#contact" className="btn btn-outline">Nhận Tư Vấn Ngay</a>
          </div>
        </div>
      </div>
    </section>
  );
};

const About = () => {
  return (
    <section id="about" className="about section">
      <div className="container about-grid">
        <div className="about-image reveal">
          {/* Unsplash Architecture Placeholder Image */}
          <img src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2062&auto=format&fit=crop" alt="Công trình xây dựng Việt Thành" />
          <div className="about-badge">
            <span className="year">10+</span>
            <span className="text">Năm Kinh Nghiệm</span>
          </div>
        </div>

        <div className="about-content reveal">
          <h3>Về Chúng Tôi</h3>
          <h2>Công Ty TNHH Cơ Khí Xây Dựng Thương Mại Việt Thành</h2>
          <p>
            Được thành lập với mục tiêu mang đến những giải pháp toàn diện cho thiết kế và thi công, chúng tôi đảm bảo kết cấu chắc chắn và bền vững cho mọi loại công trình.
          </p>
          <p>
            Bao gồm các dịch vụ tiêu biểu: Thiết kế thi công nhà thép tiền chế, Thiết kế thi công nhà thép tiền chế cho showroom, Thiết kế thi công xây dựng dân dụng, Thiết kế thi công nhà lắp ghép,..
          </p>

          <div className="about-features">
            <div className="about-feature">
              <span className="feature-icon">✓</span> Khảo sát công trình miễn phí
            </div>
            <div className="about-feature">
              <span className="feature-icon">✓</span> Giám sát thi công 24/24
            </div>
            <div className="about-feature">
              <span className="feature-icon">✓</span> Không phát sinh chi phí
            </div>
            <div className="about-feature">
              <span className="feature-icon">✓</span> Cam kết thi công đúng hạn
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Services = () => {
  const servicesData = [
    {
      title: 'Nhà Thép Tiền Chế',
      desc: 'Thi công nhanh, độ bền cao, khả năng chịu lực tốt, linh hoạt trong thiết kế và tiết kiệm chi phí. Giải pháp tối ưu cho kho xưởng, showroom.',
      icon: '🏗️'
    },
    {
      title: 'Xây Dựng Dân Dụng',
      desc: 'Mang đến những công trình chất lượng, thẩm mỹ, đáp ứng mọi tiêu chuẩn về kỹ thuật và an toàn. Đối tác tin cậy của nhiều khách hàng.',
      icon: '🏠'
    },
    {
      title: 'Thiết Kế Lắp Đặt Thang Máy',
      desc: 'Cung cấp các giải pháp thang máy an toàn, tối ưu cho mọi công trình từ tòa nhà cao tầng đến công trình dân dụng với hệ thống hiện đại.',
      icon: '🛗'
    },
    {
      title: 'Bảo Dưỡng Cầu Trục',
      desc: 'Thiết kế, thi công và bảo dưỡng cầu trục chất lượng cao. Báo giá chi tiết dựa trên khẩu độ, chiều cao, tốc độ làm việc.',
      icon: '⚙️'
    }
  ];

  return (
    <section id="services" className="services section">
      <div className="container">
        <h3 className="section-subtitle" style={{ marginBottom: "10px", color: "var(--secondary)" }}>LĨNH VỰC HOẠT ĐỘNG</h3>
        <h2 className="section-title">Dịch Vụ Thiết Kế Thi Công</h2>
        <p className="section-subtitle">
          Chúng tôi cung cấp giải pháp toàn diện, đảm bảo kết cấu chắc chắn và bền vững cho mọi công trình.
        </p>

        <div className="grid grid-2">
          {servicesData.map((srv, idx) => (
            <div className="service-card reveal" key={idx}>
              <div className="service-icon">{srv.icon}</div>
              <h3>{srv.title}</h3>
              <p>{srv.desc}</p>
              <a href="#contact" className="service-link">Tư vấn báo giá →</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Features = () => {
  const featureList = [
    { title: 'Chất lượng dịch vụ', desc: 'Tiêu chuẩn nghiêm ngặt từ thiết kế đến thi công, đạt yêu cầu kỹ thuật khắt khe.', icon: '⭐' },
    { title: 'Kinh nghiệm phong phú', desc: 'Hiểu rõ nhu cầu khách hàng, đưa ra các giải pháp tối ưu dựa trên hàng loạt dự án.', icon: '💡' },
    { title: 'Đội ngũ chuyên nghiệp', desc: 'Kỹ sư giàu kinh nghiệm, đào tạo bài bản, giám sát 24/24.', icon: '👨‍🔧' },
    { title: 'Cam kết tiến độ', desc: 'Chúng tôi hiểu thời gian là vàng, cam kết hoàn thành hợp đồng đúng hạn.', icon: '⏱️' },
    { title: 'Giải pháp linh hoạt', desc: 'Sẵn sàng lắng nghe và điều chỉnh theo yêu cầu, đảm bảo sự hài lòng.', icon: '🔄' },
    { title: 'Tối ưu chi phí', desc: 'Chất lượng cao đi đôi với giá thành hợp lý, KHÔNG phát sinh chi phí.', icon: '💰' }
  ];

  return (
    <section className="section section-bg-dark">
      <div className="container">
        <h2 className="section-title">Tại Sao Chọn Việt Thành?</h2>
        <p className="section-subtitle">Đến với chúng tôi, bạn sẽ nhận được giá trị đích thực cho mọi công trình.</p>

        <div className="features-grid">
          {featureList.map((ft, idx) => (
            <div className="feature-item" key={idx}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>{ft.icon}</div>
              <h3>{ft.title}</h3>
              <p>{ft.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Workflow = () => {
  const steps = [
    { title: 'Tiếp nhận thông tin', desc: 'Lắng nghe và ghi nhận đầy đủ nhu cầu của khách hàng.' },
    { title: 'Khảo sát & tư vấn', desc: 'Khảo sát thực tế, đưa ra giải pháp thiết kế tối ưu.' },
    { title: 'Tiến hành báo giá', desc: 'Cung cấp bảng báo giá chi tiết và minh bạch nhất.' },
    { title: 'Ký kết hợp đồng', desc: 'Xác định rõ trách nhiệm và quyền lợi của hai bên.' },
    { title: 'Thực hiện thi công', desc: 'Triển khai chuyên nghiệp, nhanh chóng và chất lượng.' },
    { title: 'Nghiệm thu bảo hành', desc: 'Nghiệm thu kỹ lưỡng và bảo hành dài hạn.' }
  ];

  return (
    <section id="workflow" className="workflow section">
      <div className="container">
        <h2 className="section-title">Quy Trình Làm Việc</h2>
        <p className="section-subtitle">Chuyên nghiệp, bài bản trong từng bước thực hiện dự án.</p>

        <div className="workflow-steps">
          {steps.map((step, idx) => (
            <div className="step-card" key={idx}>
              <div className="step-number">0{idx + 1}</div>
              <div className="step-content">
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Projects = () => {
  const projectList = [
    { title: 'Nhà Thép Tiền Chế - KCN Sóng Thần', category: 'Nhà Thép Tiền Chế', img: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=2070&auto=format&fit=crop' },
    { title: 'Showroom Ô Tô - Bình Dương', category: 'Showroom', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop' },
    { title: 'Biệt Thự Phố - TP. Dĩ An', category: 'Xây Dựng Dân Dụng', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070&auto=format&fit=crop' },
    { title: 'Hệ Thống Thang Máy - Tòa Nhà Văn Phòng', category: 'Thang Máy', img: 'https://images.unsplash.com/photo-1546422904-90eab23c3d7e?q=80&w=2072&auto=format&fit=crop' },
    { title: 'Xưởng Sản Xuất May Mặc', category: 'Nhà Thép Tiền Chế', img: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?q=80&w=2062&auto=format&fit=crop' },
    { title: 'Nhà Hàng Tiệc Cưới Luxury', category: 'Xây Dựng Dân Dụng', img: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=2098&auto=format&fit=crop' }
  ];

  return (
    <section id="projects" className="projects section">
      <div className="container">
        <h2 className="section-title">Dự Án Tiêu Biểu</h2>
        <p className="section-subtitle">Minh chứng cho chất lượng và năng lực thi công của Việt Thành qua các công trình quy mô.</p>

        <div className="grid grid-3">
          {projectList.map((pj, idx) => (
            <div className="project-card reveal" key={idx}>
              <div className="project-img">
                <img src={pj.img} alt={pj.title} loading="lazy" />
                <div className="project-overlay">
                  <span>{pj.category}</span>
                  <h3>{pj.title}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Recruitment = () => {
  const jobs = [
    {
      title: 'Kỹ Thuật Công Trình',
      salary: 'Lên tới 20.000.000 VNĐ',
      reqs: ['ĐH/CĐ Xây dựng/Cơ Khí', 'Kinh nghiệm 2-3 năm', 'Thành thạo AutoCAD', 'Sẵn sàng công tác ngoại tỉnh'],
      desc: 'Triển khai bản vẽ, bóc tách khối lượng & giám sát chất lượng tại công trình.',
      benefits: ['Đầy đủ BHXH, BHYT', 'Thưởng năng lực & Lễ Tết', 'Môi trường năng động']
    },
    {
      title: 'Kế Toán Tổng Hợp',
      salary: '7.000.000 - 12.000.000 VNĐ',
      reqs: ['CĐ/ĐH chuyên ngành Kế toán', 'Kinh nghiệm tối thiểu 2 năm', 'Thành thạo Excel & phần mềm kế toán'],
      desc: 'Thực hiện nghiệp vụ kế toán, theo dõi thu chi, báo cáo tài chính & thuế.',
      benefits: ['Tham gia BHXH theo quy định', 'Thưởng lương tháng 13', 'Môi trường ổn định']
    },
    {
      title: 'Thợ Hàn Cơ Khí',
      salary: 'Từ 15.000.000 VNĐ',
      reqs: ['Biết hàn que/MIG cơ bản', 'Có thể làm việc trên cao', 'Sức khỏe tốt'],
      desc: 'Hàn, gia công & lắp dựng kết cấu thép nhà xưởng tiền chế.',
      benefits: ['Hỗ trợ ăn ở tại công trình', 'Phụ cấp công tác', 'BHXH đầy đủ']
    }
  ];

  return (
    <section id="recruitment" className="section recruitment">
      <div className="container">
        <h2 className="section-title">Cơ Hội Nghề Nghiệp</h2>
        <p className="section-subtitle">Gia nhập đội ngũ Việt Thành để cùng xây dựng những công trình bền vững.</p>

        <div className="recruitment-grid">
          {jobs.map((job, idx) => (
            <div className="job-card reveal" key={idx}>
              <div className="job-badge">Đang Tuyển Dụng</div>
              <h3>{job.title}</h3>
              <div className="job-salary">💰 {job.salary}</div>
              
              <div className="job-info-block">
                <h4><span style={{color: 'var(--secondary)'}}>📋</span> Mô tả công việc</h4>
                <p style={{fontSize: '0.9rem', color: 'var(--gray)', marginBottom: '10px'}}>{job.desc}</p>
              </div>

              <div className="job-info-block">
                <h4><span style={{color: 'var(--secondary)'}}>🎓</span> Yêu cầu</h4>
                <ul>
                  {job.reqs.map((req, i) => <li key={i}>{req}</li>)}
                </ul>
              </div>

              <div className="job-info-block">
                <h4><span style={{color: 'var(--secondary)'}}>🎁</span> Quyền lợi</h4>
                <ul>
                  {job.benefits.map((ben, i) => <li key={i}>{ben}</li>)}
                </ul>
              </div>

              <div className="job-footer">
                <a href="https://zalo.me/0972524799" target="_blank" className="btn btn-primary" style={{width: '100%'}}>Ứng Tuyển Ngay</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Testimonials = () => {
  const reviews = [
    { name: 'Ông Nguyễn Văn Hùng', role: 'GĐ Công ty May Mặc Hùng Phát', text: 'Việt Thành đã thực hiện nhà xưởng của chúng tôi rất chuyên nghiệp. Tiến độ nhanh và chất lượng thép rất đảm bảo.', avatar: 'https://i.pravatar.cc/150?u=hung' },
    { name: 'Bà Lê Thị Mai', role: 'Chủ đầu tư Biệt Thự Dĩ An', text: 'Rất hài lòng với đội ngũ kỹ sư của Việt Thành. Họ tư vấn tận tình và giám sát thi công rất kỹ lưỡng.', avatar: 'https://i.pravatar.cc/150?u=mai' },
    { name: 'Anh Trần Quốc Tuấn', role: 'Quản lý Showroom Auto', text: 'Giải pháp nhà thép cho showroom của Việt Thành vừa thẩm mỹ vừa giúp chúng tôi tiết kiệm chi phí vận hành.', avatar: 'https://i.pravatar.cc/150?u=tuan' }
  ];

  return (
    <section className="testimonials section section-bg-light">
      <div className="container">
        <h2 className="section-title">Khách Hàng Nói Gì?</h2>
        <p className="section-subtitle">Sự hài lòng của khách hàng là thước đo thành công lớn nhất của chúng tôi.</p>

        <div className="grid grid-3">
          {reviews.map((rv, idx) => (
            <div className="testimonial-card reveal" key={idx}>
              <div className="quote-icon">"</div>
              <p className="testimonial-text">{rv.text}</p>
              <div className="testimonial-user">
                <img src={rv.avatar} alt={rv.name} />
                <div>
                  <h5>{rv.name}</h5>
                  <span>{rv.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Contact = () => {
  return (
    <section id="contact" className="section" style={{ backgroundColor: '#fff' }}>
      <div className="container">
        <div className="grid grid-2" style={{ alignItems: 'center', backgroundColor: '#f8fafc', padding: '50px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
          <div>
            <h2 className="text-primary" style={{ fontSize: '2rem', marginBottom: '20px' }}>Cần Tư Vấn? Liên Hệ Ngay Hôm Nay</h2>
            <p style={{ color: 'var(--gray)', marginBottom: '30px', fontSize: '1.1rem' }}>
              Chúng tôi sẵn sàng hỗ trợ mọi thắc mắc về dịch vụ thiết kế và thi công. Hãy liên hệ để được tư vấn tận tình và nhanh chóng!
            </p>
            <ul className="contact-info" style={{ listStyle: 'none', padding: 0 }}>
              <li style={{ display: 'flex', marginBottom: '15px' }}><span style={{ marginRight: '15px', fontSize: '1.5rem' }}>📍</span> <span><strong>Địa chỉ:</strong> 122/118, KP. Tân Lập, P. Đông Hòa, TP. Dĩ An, Bình Dương</span></li>
              <li style={{ display: 'flex', marginBottom: '15px' }}><span style={{ marginRight: '15px', fontSize: '1.5rem' }}>🏢</span> <span><strong>Trụ sở:</strong> Milano ML127 KĐT Ecocity Premia, P. Tân An, TP. Buôn Ma Thuột</span></li>
              <li style={{ display: 'flex', marginBottom: '15px' }}><span style={{ marginRight: '15px', fontSize: '1.5rem' }}>📞</span> <span><strong>Hotline:</strong> 0972 524 799</span></li>
              <li style={{ display: 'flex', marginBottom: '15px' }}><span style={{ marginRight: '15px', fontSize: '1.5rem' }}>📧</span> <span><strong>Email:</strong> vietthanh.me.con@gmail.com</span></li>
            </ul>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '40px 30px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '15px' }}>Đường Dây Nóng Hỗ Trợ 24/7</h3>
              <p style={{ marginBottom: '25px', opacity: 0.9 }}>Liên hệ Zalo / Gọi trực tiếp để nhận báo giá chi tiết.</p>
              <a href="tel:0972524799" className="btn btn-secondary" style={{ width: '100%', fontSize: '1.2rem', padding: '15px 0', display: 'block', marginBottom: '15px' }}>📞 0972 524 799</a>
              <a href="https://zalo.me/0972524799" target="_blank" className="btn btn-outline" style={{ width: '100%', display: 'block' }}>💬 Nhắn tin Zalo</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-col" style={{ gridColumn: 'span 2' }}>
            <a href="#" className="footer-logo">VIỆT THÀNH <span>CONSTRUCTION</span></a>
            <p className="footer-desc">
              Công Ty TNHH Cơ Khí Xây Dựng Thương Mại Việt Thành là đơn vị uy tín trong thiết kế và thi công nhà tiền chế. Chúng tôi cam kết mang đến dịch vụ chất lượng, giải pháp linh hoạt và đảm bảo tiến độ, không phát sinh chi phí.
            </p>
            <p><strong>Giấy phép ĐKKD:</strong> số 3702556996 - Do Sở Kế Hoạch Và Đầu Tư Tỉnh Bình Dương cấp ngày 25/4/2017</p>
            <p style={{ marginTop: '5px' }}><strong>Người chịu trách nhiệm:</strong> Lê Quang Khải</p>
          </div>
          <div className="footer-col">
            <h4>Danh Mục</h4>
            <ul className="footer-links">
              <li><a href="#home">Trang Chủ</a></li>
              <li><a href="#about">Giới Thiệu</a></li>
              <li><a href="#services">Dịch Vụ Thi Công</a></li>
              <li><a href="#services">Nhà Thép Tiền Chế</a></li>
              <li><a href="#workflow">Quy Trình</a></li>
              <li><a href="#contact">Liên Hệ</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} Bản quyền thuộc về Công Ty TNHH Cơ Khí Xây Dựng Thương Mại Việt Thành.</p>
        </div>
      </div>
    </footer>
  );
};

// ----------------------------------------------------
// MAIN APPLICATION COORDINATOR
// ----------------------------------------------------
const App = () => {
  useEffect(() => {
    const observerOptions = {
      threshold: 0.15
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-wrapper">
      <Header />
      <main>
        <Hero />
        <About />
        <Services />
        <Features />
        <Projects />
        <Recruitment />
        <Testimonials />
        <Workflow />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

// Mount Application
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
