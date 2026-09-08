import React, { useState, useEffect, useRef } from 'react';
import { Database, Shield, HelpCircle, Loader2, FileCheck2, AlertCircle, Folder } from 'lucide-react';
import { downloadDriveFile } from '../utils/googleDrive';
import { getAppSettings, saveAppSettings } from '../utils/db';

// Declare globals for Google APIs loaded in index.html
declare const google: any;
declare const gapi: any;

interface GoogleDriveConnectorProps {
  onPDFsLoaded: (pdfs: { data: ArrayBuffer; name: string }[]) => void;
  onError: (msg: string) => void;
  accessToken: string | null;
}

export const GoogleDriveConnector: React.FC<GoogleDriveConnectorProps> = ({ onPDFsLoaded, onError, accessToken }) => {
  // Read config from Vite environment variables (.env)
  const clientId = import.meta.env.BST_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.GOOGLE_CLIENT_ID || '';
  const apiKey = import.meta.env.BST_GOOGLE_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || import.meta.env.GOOGLE_API_KEY || '';

  // Use a ref to store the access token securely and prevent stale closures
  const tokenRef = useRef<string>('');
  const [folderId, setFolderId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [googleScriptsLoaded, setGoogleScriptsLoaded] = useState<boolean>(false);
  const [switchAccount, setSwitchAccount] = useState<boolean>(false);

  useEffect(() => {
    // Load saved folder ID
    setFolderId(getAppSettings().googleFolderId || '');

    // Check if Google scripts are loaded in the window
    const checkScripts = () => {
      if (typeof google !== 'undefined' && typeof gapi !== 'undefined') {
        setGoogleScriptsLoaded(true);
      } else {
        setTimeout(checkScripts, 500);
      }
    };
    checkScripts();
  }, []);

  // Callback from Google Picker selection (supports multiple files)
  const pickerCallback = async (data: any) => {
    const action = data[google.picker.Response.ACTION];

    if (action === google.picker.Action.PICKED) {
      const docs = data[google.picker.Response.DOCUMENTS];
      if (!docs || docs.length === 0) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const loadedPDFs: { data: ArrayBuffer; name: string }[] = [];

        // Loop through all selected files and download them in parallel
        await Promise.all(
          docs.map(async (doc: any) => {
            const fileId = doc[google.picker.Document.ID];
            const filename = doc[google.picker.Document.NAME];
            // Use the tokenRef to read the absolute latest token, avoiding stale closure (401 error)
            const arrayBuffer = await downloadDriveFile(tokenRef.current, fileId);
            loadedPDFs.push({ data: arrayBuffer, name: filename });
          })
        );

        onPDFsLoaded(loadedPDFs);
      } catch (e: any) {
        onError(`Lỗi tải tệp từ Google Drive: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    } else if (action === google.picker.Action.CANCEL) {
      setIsLoading(false);
    }
  };

  // Open the Google Picker UI
  const createPicker = (token: string) => {
    try {
      gapi.load('client:picker', () => {
        const view = new google.picker.DocsView(google.picker.ViewId.PDFS);
        view.setMimeTypes('application/pdf'); // Filter only PDF files

        if (folderId.trim()) {
          view.setParent(folderId.trim());
        }

        const appId = clientId.split('-')[0];

        const picker = new google.picker.PickerBuilder()
          .enableFeature(google.picker.Feature.NAV_HIDDEN)
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED) // 1. Enable multiple file selection!
          .setDeveloperKey(apiKey.trim())
          .setOAuthToken(token)
          .setAppId(appId)
          .addView(view)
          .setCallback(pickerCallback)
          .setTitle('Chọn các tệp sao kê PDF từ Google Drive')
          .build();

        picker.setVisible(true);
      });
    } catch (e: any) {
      onError(`Không thể khởi tạo Google Picker: ${e.message}`);
      setIsLoading(false);
    }
  };

  // Sign in and fetch OAuth token
  const handleOpenPickerFlow = (forceSwitch = false) => {
    if (!clientId.trim() || !apiKey.trim()) {
      onError('Vui lòng thiết lập BST_GOOGLE_CLIENT_ID và BST_GOOGLE_API_KEY trong file .env hoặc trên Vercel trước.');
      return;
    }

    if (!googleScriptsLoaded) {
      onError('Thư viện Google SDK chưa được tải xong. Vui lòng tải lại trang.');
      return;
    }

    setIsLoading(true);

    try {
      const settings = getAppSettings();

      // Check if we already have a fresh token in this session
      if (accessToken && !switchAccount && !forceSwitch) {
        tokenRef.current = accessToken;
        createPicker(accessToken);
        return;
      }

      // Initialize Token Client
      const initOptions: any = {
        client_id: clientId.trim(),
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        callback: (tokenResponse: any) => {
          if (tokenResponse.error) {
            setIsLoading(false);
            onError(`Đăng nhập thất bại: ${tokenResponse.error}`);
            return;
          }
          if (tokenResponse.access_token) {
            tokenRef.current = tokenResponse.access_token;

            // Fetch user info to get email address
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
            })
              .then(res => res.json())
              .then(userInfo => {
                const email = userInfo.email || 'Google Account';
                const s = getAppSettings();
                s.googleAccountEmail = email;
                s.googleLoginTime = new Date().toISOString();
                s.googleAccessToken = tokenResponse.access_token;
                saveAppSettings(s);

                setSwitchAccount(false);
              })
              .catch(err => {
                console.error('Error fetching user info:', err);
                setSwitchAccount(false);
              });

            createPicker(tokenResponse.access_token);
          }
        },
        error_callback: (err: any) => {
          setIsLoading(false);
          onError(`Lỗi đăng nhập Google: ${err.message || err}`);
        }
      };

      // Handle account switching vs auto-login hints
      if (switchAccount || forceSwitch) {
        initOptions.prompt = 'select_account';
      } else if (settings.googleAccountEmail) {
        initOptions.login_hint = settings.googleAccountEmail;
      }

      const tokenClient = google.accounts.oauth2.initTokenClient(initOptions);

      // Request token
      tokenClient.requestAccessToken();
    } catch (e: any) {
      setIsLoading(false);
      onError(`Không thể khởi tạo phiên đăng nhập: ${e.message}`);
    }
  };

  const isConfigured = clientId.trim() !== '' && apiKey.trim() !== '';

  return (
    <div className="glass-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', padding: '0.5rem', borderRadius: 'var(--border-radius-md)' }}>
            <Database size={24} color="var(--color-info)" />
          </div>
          <div>
            <h3>Chọn tệp từ Google Drive</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Nhập và chọn trực tiếp tệp sao kê PDF từ Google Drive của bạn
            </p>
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => setShowInstructions(!showInstructions)}
          style={{ padding: '0.5rem', borderRadius: 'var(--border-radius-md)' }}
          title="Hướng dẫn cấu hình"
        >
          <HelpCircle size={18} />
        </button>
      </div>

      {/* Warning if credentials not set in env */}
      {!isConfigured && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: 'var(--color-danger)',
          padding: '1.25rem',
          borderRadius: 'var(--border-radius-md)',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'start',
          gap: '0.75rem',
          lineHeight: '1.5'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Chưa thiết lập biến môi trường!</strong>
            Vui lòng tạo tệp <code>.env</code> ở thư mục gốc của dự án (hoặc sao chép từ <code>.env.example</code>) và thiết lập cấu hình:
            <pre style={{
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              padding: '0.5rem',
              borderRadius: 'var(--border-radius-sm)',
              marginTop: '0.5rem',
              fontSize: '0.8rem',
              fontFamily: 'monospace'
            }}>
              GOOGLE_CLIENT_ID=your_client_id_here<br />
              GOOGLE_API_KEY=your_api_key_here
            </pre>
            Sau đó khởi động lại server phát triển (npm run dev) để cập nhật.
          </div>
        </div>
      )}

      {/* Instructions Accordion */}
      {showInstructions && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          borderLeft: '4px solid var(--color-info)',
          padding: '1rem',
          borderRadius: 'var(--border-radius-sm)',
          fontSize: '0.85rem',
          lineHeight: '1.6'
        }}>
          <h4 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={16} color="var(--color-info)" /> Cách cấu hình Google Credentials trong file .env
          </h4>
          <ol style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <li>Lưu file sao kê từ Gmail vào Google Drive của bạn (bằng nút Drive có sẵn trên Gmail).</li>
            <li>Truy cập <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--color-info)', fontWeight: '600' }}>Google Cloud Console</a>.</li>
            <li>Tạo một dự án mới (ví dụ: <code>Bank Picker</code>).</li>
            <li>Vào tab **APIs & Services ➔ Library**, kích hoạt **Google Picker API** và **Google Drive API**.</li>
            <li>Cấu hình **OAuth consent screen** (chọn External, điền App Name, thêm email của bạn vào danh sách **Test Users**).</li>
            <li>Vào tab **Credentials** để tạo:
              <ul style={{ paddingLeft: '1.2rem', margin: '0.25rem 0' }}>
                <li>**OAuth client ID** (chọn loại Web application, thêm Authorized JavaScript origins là <code>http://localhost:5173</code>).</li>
                <li>**API Key** (dành cho popup chọn tệp).</li>
              </ul>
            </li>
            <li>Sao chép hai mã này, dán vào tệp <code>.env</code> ở thư mục gốc của dự án.</li>
          </ol>
        </div>
      )}

      {/* Folder ID Filter Configuration */}
      {isConfigured && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '1.25rem',
          borderRadius: 'var(--border-radius-md)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <label style={{
            fontSize: '0.85rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--text-primary)'
          }}>
            <Folder size={16} color="var(--color-info)" />
            ID Thư mục Google Drive chứa sao kê (Tùy chọn)
          </label>
          <input
            type="text"
            placeholder="Dán ID thư mục từ link Drive của bạn (ví dụ: 1a2b3c...)"
            value={folderId}
            onChange={(e) => {
              const val = e.target.value;
              setFolderId(val);
              const s = getAppSettings();
              s.googleFolderId = val;
              saveAppSettings(s);
            }}
            style={{
              width: '100%',
              backgroundColor: 'var(--surface-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--border-radius-sm)',
              fontSize: '0.9rem'
            }}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            Khi điền ID này, Google Picker sẽ mở trực tiếp thư mục này và lọc chỉ hiển thị các tệp PDF sao kê để bạn chọn nhanh hơn (Để trống nếu muốn hiển thị toàn bộ Drive).
          </p>
        </div>
      )}

      {/* Account Info & Switcher Option */}
      {isConfigured && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-secondary)',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--border-radius-md)',
          border: '1px solid var(--border-color)',
        }}>
          <div>
            {getAppSettings().googleAccountEmail ? (
              <span>Tài khoản đang liên kết: <strong style={{ color: 'var(--text-primary)' }}>{getAppSettings().googleAccountEmail}</strong></span>
            ) : (
              <span>Chưa liên kết tài khoản Google nào.</span>
            )}
          </div>
          <div>
            <button
              onClick={() => handleOpenPickerFlow(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-info)',
                cursor: 'pointer',
                fontWeight: '600',
                padding: 0,
                textDecoration: 'underline',
                fontSize: '0.8rem'
              }}
            >
              Liên kết tài khoản Google khác
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
        <button
          className="btn btn-primary theme-transition"
          onClick={() => handleOpenPickerFlow(false)}
          disabled={isLoading || !isConfigured}
          style={{
            padding: '0.85rem 2.5rem',
            fontSize: '1rem',
            backgroundColor: 'var(--color-info)',
            color: '#ffffff',
            boxShadow: isConfigured ? '0 4px 12px rgba(6, 182, 212, 0.2)' : 'none'
          }}
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <FileCheck2 size={20} />
          )}
          {isLoading ? 'Đang tải các tệp...' : accessToken ? 'Chọn file từ Drive' : 'Đăng nhập & Chọn file từ Drive'}
        </button>
      </div>

    </div>
  );
};
