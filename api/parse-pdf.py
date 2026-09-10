from http.server import BaseHTTPRequestHandler
import json
import base64
import io
from pypdf import PdfReader
from pypdf.errors import WrongPasswordError, FileNotDecryptedError

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept')
        self.end_headers()

    def do_POST(self):
        password = ''
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self._send_json(400, {'error': 'Empty request body'})
                return

            body_bytes = self.rfile.read(content_length)
            body = json.loads(body_bytes.decode('utf-8'))
            
            file_base64 = body.get('fileBase64', '')
            password = body.get('password', '')

            if not file_base64:
                self._send_json(400, {'error': 'Missing fileBase64 data'})
                return

            pdf_bytes = base64.b64decode(file_base64)
            pdf_stream = io.BytesIO(pdf_bytes)
            
            reader = PdfReader(pdf_stream)
            
            if reader.is_encrypted:
                decrypted = False
                if password:
                    try:
                        decrypted = (reader.decrypt(password) != 0)
                    except Exception:
                        decrypted = False
                
                if not decrypted:
                    error_msg = 'INCORRECT_PASSWORD' if password else 'PASSWORD_REQUIRED'
                    self._send_json(401, {'error': error_msg})
                    return

            raw_rows = []
            row_index_counter = 0

            for page_idx, page in enumerate(reader.pages):
                items = []

                def visitor_body(text, cm, tm, font_dict, font_size):
                    if text and text.strip():
                        # tm[4] is X coordinate, tm[5] is Y coordinate
                        items.append({
                            'str': text,
                            'x': float(tm[4]),
                            'y': float(tm[5]),
                            'width': float(len(text) * (font_size or 10) * 0.5)
                        })

                page.extract_text(visitor_text=visitor_body)

                if not items:
                    continue

                # Group items into rows by Y coordinate (< 10px difference)
                row_groups = []
                for item in items:
                    found = False
                    for g in row_groups:
                        if abs(g['y'] - item['y']) < 10:
                            g['items'].append(item)
                            found = True
                            break
                    if not found:
                        row_groups.append({'y': item['y'], 'items': [item]})

                # Sort rows top-to-bottom (Y descending)
                row_groups.sort(key=lambda g: g['y'], reverse=True)

                for group in row_groups:
                    # Sort items inside row left-to-right (X ascending)
                    group['items'].sort(key=lambda item: item['x'])

                    cells = []
                    current_cell = ""
                    last_right = -999.0

                    for item in group['items']:
                        if last_right == -999.0:
                            current_cell = item['str']
                            last_right = item['x'] + item['width']
                        elif item['x'] - last_right < 6:
                            current_cell += " " + item['str']
                            last_right = max(last_right, item['x'] + item['width'])
                        else:
                            if current_cell.strip():
                                cells.append(current_cell.strip())
                            current_cell = item['str']
                            last_right = item['x'] + item['width']

                    if current_cell.strip():
                        cells.append(current_cell.strip())

                    if cells:
                        raw_rows.append({
                            'index': row_index_counter,
                            'cells': cells
                        })
                        row_index_counter += 1

            self._send_json(200, {'rawRows': raw_rows})

        except (WrongPasswordError, FileNotDecryptedError):
            self._send_json(401, {'error': 'INCORRECT_PASSWORD' if password else 'PASSWORD_REQUIRED'})
        except Exception as e:
            self._send_json(500, {'error': f'Failed to parse PDF: {str(e)}'})

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
