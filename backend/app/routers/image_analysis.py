from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import List, Dict, Any
import base64
import io
import json
from PIL import Image, ImageDraw, ImageFont
import logging
from app import models
from app.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["image-analysis"])

@router.post("/analyze-image")
async def analyze_image(
    image: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user)
):
    """
    Analyzes an uploaded dashboard image and generates component structure.
    This is a placeholder implementation that can be enhanced with AI/ML services.
    """
    try:
        # Read image file
        image_data = await image.read()
        img = Image.open(io.BytesIO(image_data))
        
        # Get image dimensions
        width, height = img.size
        
        # Enhanced component detection
        # In production, use: OpenCV, YOLO, Google Vision API, OCR (Tesseract)
        
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        image_data_url = f"data:{image.content_type};base64,{image_base64}"
        
        import time
        timestamp = int(time.time() * 1000)
        
        # Convert to RGB for analysis
        if img.mode != 'RGB':
            img_rgb = img.convert('RGB')
        else:
            img_rgb = img
        
        # Detect components by analyzing image regions
        # Only detect charts/graphs
        detected_elements = []
        
        # Divide image into regions for chart detection
        grid_cols = 6
        grid_rows = 6
        cell_width = width // grid_cols
        cell_height = height // grid_rows
        
        # Analyze each region to detect charts only
        for row in range(grid_rows):
            for col in range(grid_cols):
                x = col * cell_width
                y = row * cell_height
                region = img_rgb.crop((x, y, min(x + cell_width, width), min(y + cell_height, height)))
                
                # Get color statistics for detection
                colors = region.getcolors(maxcolors=10000)
                if colors:
                    color_count = len(colors)
                    total_pixels = region.width * region.height
                    
                    # Charts: High color variance, many unique colors
                    # Only detect regions with high complexity (likely charts)
                    if color_count > 500:  # High complexity - likely chart
                        # Determine chart type (simplified detection)
                        element_type = 'graph'
                        chart_type = 'line'  # Default, can be enhanced with better detection
                        
                        # Generate sample chart data
                        chart_data = {
                            "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                            "datasets": [
                                {
                                    "label": "Series 1",
                                    "data": [10, 20, 15, 25, 30, 28]
                                },
                                {
                                    "label": "Series 2",
                                    "data": [5, 15, 10, 20, 25, 22]
                                }
                            ]
                        }
                        
                        detected_elements.append({
                            "type": element_type,
                            "bounds": {
                                "x": x,
                                "y": y,
                                "width": cell_width,
                                "height": cell_height
                            },
                            "chartType": chart_type,
                            "chartData": chart_data
                        })
        
        # Create main container
        main_container = {
            "id": f"comp-container-{timestamp}",
            "type": "div",
            "props": {
                "style": {
                    "width": f"{width}px",
                    "minHeight": f"{height}px",
                    "position": "relative",
                    "margin": "0 auto",
                    "background": "#ffffff",
                    "padding": "20px"
                }
            },
            "children": []
        }
        
        # Create components from detected elements
        for idx, element in enumerate(detected_elements):
            element_id = f"comp-{timestamp}-{idx}"
            bounds = element["bounds"]
            
            if element["type"] == "graph":
                # Create chart component
                chart_component = {
                    "id": element_id,
                    "type": "div",
                    "props": {
                        "style": {
                            "position": "absolute",
                            "left": f"{bounds['x']}px",
                            "top": f"{bounds['y']}px",
                            "width": f"{bounds['width']}px",
                            "height": f"{bounds['height']}px",
                            "backgroundColor": "#ffffff",
                            "border": "1px solid #e0e0e0",
                            "borderRadius": "4px",
                            "padding": "10px"
                        },
                        "className": "chart-container",
                        "data-chart-type": element.get("chartType", "line"),
                        "data-chart-data": json.dumps(element.get("chartData", {}))
                    },
                    "children": []
                }
                main_container["children"].append(chart_component)
        
        # Create annotated image with bounding boxes
        annotated_img = img_rgb.copy()
        draw = ImageDraw.Draw(annotated_img)
        
        # Color mapping for component types (only charts)
        type_colors = {
            "graph": "#667eea",  # Purple for charts
        }
        
        # Draw bounding boxes for each detected element
        for element in detected_elements:
            bounds = element["bounds"]
            element_type = element["type"]
            color = type_colors.get(element_type, "#667eea")
            
            # Draw rectangle
            x1 = bounds["x"]
            y1 = bounds["y"]
            x2 = x1 + bounds["width"]
            y2 = y1 + bounds["height"]
            
            # Draw filled rectangle with transparency
            overlay = Image.new('RGBA', annotated_img.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            # Convert hex color to RGB tuple
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            overlay_draw.rectangle([x1, y1, x2, y2], fill=(r, g, b, 30), outline=(r, g, b, 255), width=3)
            annotated_img = Image.alpha_composite(annotated_img.convert('RGBA'), overlay).convert('RGB')
            draw = ImageDraw.Draw(annotated_img)
            
            # Draw border on final image
            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
            
            # Draw label
            try:
                # Try to use a default font, fallback to basic if not available
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
            except:
                try:
                    font = ImageFont.truetype("arial.ttf", 14)
                except:
                    font = ImageFont.load_default()
            
            label = f"{element_type.upper()}"
            # Get text size
            bbox = draw.textbbox((0, 0), label, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # Draw label background
            label_y = max(y1 - text_height - 6, 0)
            draw.rectangle([x1, label_y, x1 + text_width + 8, label_y + text_height + 4], fill=color)
            draw.text((x1 + 4, label_y + 2), label, fill="white", font=font)
        
        # Convert annotated image to base64
        annotated_bytes = io.BytesIO()
        annotated_img.save(annotated_bytes, format='PNG')
        annotated_bytes.seek(0)
        annotated_base64 = base64.b64encode(annotated_bytes.read()).decode('utf-8')
        annotated_data_url = f"data:image/png;base64,{annotated_base64}"
        
        analysis_result = {
            "components": [main_container],
            "detectedElements": detected_elements,
            "annotatedImage": annotated_data_url
        }
        
        return analysis_result
        
    except Exception as e:
        logger.error(f"Image analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")

