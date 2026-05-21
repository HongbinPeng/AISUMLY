import { request } from '../utils/request.js'

/**
 * 使用邮箱和密码登录。
 * @param {string} email 邮箱
 * @param {string} password 密码
 * @returns {Promise<object>} 登录令牌和用户信息
 */
export function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false)
}

/**
 * 注册新用户。
 * @param {string} email 邮箱
 * @param {string} password 密码
 * @param {string} nickname 昵称
 * @returns {Promise<object>} 登录令牌和用户信息
 */
export function register(email, password, nickname) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  }, false)
}

/**
 * 获取当前登录用户信息。
 * @returns {Promise<object>} 当前用户信息
 */
export function getMe() {
  return request('/auth/me')
}

/**
 * 退出登录并使 refresh token 失效。
 * @param {string} refreshToken 刷新令牌
 * @returns {Promise<object>} 后端响应
 */
export function logout(refreshToken) {
  return request('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, false)
}
