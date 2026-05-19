import { useState } from 'react'
import { doLogin, doRegister } from '../store/auth.js'

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        await doLogin(email, password)
      } else {
        await doRegister(email, password, nickname)
      }
    } catch (err) {
      setError(err.message || (isLogin ? '登录失败' : '注册失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h2>{isLogin ? '登录' : '注册'} AISumly</h2>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              minLength={6}
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label>昵称（可选）</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="你的昵称"
              />
            </div>
          )}

          <button className="btn-submit" type="submit" disabled={loading}>
            {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
          </button>
        </form>

        <button className="btn-switch" onClick={() => {
          setIsLogin(!isLogin)
          setError('')
        }}>
          {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
      </div>
    </div>
  )
}
