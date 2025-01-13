import sys
from pdf2image import convert_from_path
from img2pdf import convert
import os

def pdf_to_images_to_pdf(input_path, output_path):
    try:
        # Debug: Print the input and output paths
        print(f"Input PDF path: {input_path}")
        print(f"Output PDF path: {output_path}")

        # Convert PDF to images
        print("Converting PDF to images...")
        images = convert_from_path(input_path)
        print(f"Number of pages converted: {len(images)}")

        image_files = []
        temp_dir = 'temp_images'

        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        for i, image in enumerate(images):
            temp_image_path = os.path.join(temp_dir, f'page_{i+1}.jpg')
            image.save(temp_image_path, 'JPEG')
            image_files.append(temp_image_path)

        # Convert images back to PDF
        print("Converting images back to PDF...")
        with open(output_path, 'wb') as f:
            f.write(convert(image_files))

        # Clean up temporary images
        for image_file in image_files:
            os.remove(image_file)
        os.rmdir(temp_dir)

        print("PDF successfully converted to images and back to PDF!")
    except Exception as e:
        print(f"Error during conversion: {e}")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python pdf_converter.py <input_pdf_path> <output_pdf_path>")
    else:
        input_pdf_path = sys.argv[1]
        output_pdf_path = sys.argv[2]
        pdf_to_images_to_pdf(input_pdf_path, output_pdf_path)