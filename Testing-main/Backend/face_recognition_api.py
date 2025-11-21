from flask import Flask, request, jsonify
from flask_cors import CORS
from deepface import DeepFace
import os
import base64
import tempfile
import traceback

app = Flask(__name__)
CORS(app)

@app.route('/verify', methods=['POST'])
def verify_faces():
    try:
        data = request.json
        
        if not data or 'reference_photo' not in data or 'today_photo' not in data:
            return jsonify({
                'match': False,
                'confidence': 0.0,
                'error': 'Missing reference_photo or today_photo'
            }), 400
        
        reference_photo = data['reference_photo']
        today_photo = data['today_photo']
        
        # Decode base64 images
        try:
            # Handle base64 data URLs (data:image/jpeg;base64,...)
            if reference_photo.startswith('data:'):
                reference_photo = reference_photo.split(',')[1]
            if today_photo.startswith('data:'):
                today_photo = today_photo.split(',')[1]
            
            ref_img_data = base64.b64decode(reference_photo)
            today_img_data = base64.b64decode(today_photo)
        except Exception as e:
            return jsonify({
                'match': False,
                'confidence': 0.0,
                'error': f'Invalid base64 image data: {str(e)}'
            }), 400
        
        # Save to temporary files
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as ref_file:
            ref_file.write(ref_img_data)
            ref_path = ref_file.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as today_file:
            today_file.write(today_img_data)
            today_path = today_file.name
        
        try:
            # Use DeepFace to verify
            result = DeepFace.verify(
                img1_path=ref_path,
                img2_path=today_path,
                model_name='VGG-Face',
                enforce_detection=True,
                distance_metric='cosine'
            )
            
            # DeepFace returns: {'verified': True/False, 'distance': float, 'threshold': float}
            is_match = result['verified']
            distance = result['distance']
            threshold = result['threshold']
            
            # Calculate confidence (0-1 scale, higher is better)
            # Distance is lower when faces are more similar
            # Confidence = 1 - (distance / threshold), clamped to 0-1
            confidence = max(0.0, min(1.0, 1.0 - (distance / threshold)))
            
            return jsonify({
                'match': is_match,
                'confidence': round(confidence, 4),
                'distance': round(distance, 4),
                'threshold': round(threshold, 4)
            })
            
        except Exception as e:
            # Handle face detection errors
            error_msg = str(e)
            if 'Face could not be detected' in error_msg or 'No face detected' in error_msg:
                return jsonify({
                    'match': False,
                    'confidence': 0.0,
                    'error': 'Face could not be detected in one or both images'
                }), 400
            else:
                return jsonify({
                    'match': False,
                    'confidence': 0.0,
                    'error': f'Face recognition error: {error_msg}'
                }), 500
        finally:
            # Clean up temporary files
            try:
                os.unlink(ref_path)
                os.unlink(today_path)
            except:
                pass
                
    except Exception as e:
        return jsonify({
            'match': False,
            'confidence': 0.0,
            'error': f'Server error: {str(e)}',
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'face-recognition-api'})

if __name__ == '__main__':
    port = int(os.environ.get('FACE_RECOGNITION_PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)

